import crypto from "node:crypto";
import { getAppRuntimeEnv } from "@/lib/env.server";

const DEV_FALLBACK_SECRET = "giraffle-dev-secret-box-fallback";
const SECRET_BOX_VERSION = "v1";

function resolveSecretBoxSeed(explicitSeed?: string | null) {
  if (explicitSeed && explicitSeed.trim()) {
    return explicitSeed.trim();
  }

  const fromEnv =
    process.env.APP_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  if (!getAppRuntimeEnv().isProduction) {
    return DEV_FALLBACK_SECRET;
  }

  return null;
}

function deriveKey(seed: string) {
  return crypto.createHash("sha256").update(seed).digest();
}

export function canUseSecretBox() {
  return Boolean(resolveSecretBoxSeed());
}

export function encryptSecretValue(value: string, explicitSeed?: string | null) {
  const seed = resolveSecretBoxSeed(explicitSeed);

  if (!seed) {
    throw new Error(
      "APP_ENCRYPTION_KEY or AUTH_SECRET is required to store encrypted settings.",
    );
  }

  const key = deriveKey(seed);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_BOX_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecretValue(payload: string, explicitSeed?: string | null) {
  const seed = resolveSecretBoxSeed(explicitSeed);

  if (!seed) {
    throw new Error(
      "APP_ENCRYPTION_KEY or AUTH_SECRET is required to read encrypted settings.",
    );
  }

  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");

  if (
    version !== SECRET_BOX_VERSION ||
    !ivRaw ||
    !tagRaw ||
    !encryptedRaw
  ) {
    throw new Error("Unsupported encrypted payload format.");
  }

  const key = deriveKey(seed);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function buildSecretPreview(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const lastFour = trimmed.slice(-4);
  return `${"•".repeat(Math.max(4, trimmed.length > 8 ? 8 : 4))}${lastFour}`;
}
