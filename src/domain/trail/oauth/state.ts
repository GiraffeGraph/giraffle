import crypto from "node:crypto";
import { getAppSetting } from "@/domain/app-settings/app-settings.service";
import { decryptSecretValue, encryptSecretValue } from "@/lib/secret-box";

export interface OAuthState {
  userId: string;
  trailId: string;
  nonce: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;

export function encodeOAuthState(input: { userId: string; trailId: string }): string {
  const state: OAuthState = {
    userId: input.userId,
    trailId: input.trailId,
    nonce: crypto.randomBytes(16).toString("base64url"),
    expiresAt: Date.now() + TTL_MS,
  };
  return encryptSecretValue(JSON.stringify(state));
}

export function decodeOAuthState(token: string): OAuthState | null {
  try {
    const json = decryptSecretValue(token);
    const parsed = JSON.parse(json) as OAuthState;
    if (Date.now() > parsed.expiresAt) return null;
    if (!parsed.userId || !parsed.trailId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function buildPublicOrigin(req: Request): Promise<string> {
  const appOverride = await getAppSetting("TRAIL_OAUTH_PUBLIC_ORIGIN");
  const fromConfig = appOverride || process.env.NEXTAUTH_URL?.trim();
  if (fromConfig) return fromConfig.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function buildCallbackUrl(req: Request, providerKind: string): Promise<string> {
  const origin = await buildPublicOrigin(req);
  return `${origin}/api/trails/oauth/${providerKind}/callback`;
}
