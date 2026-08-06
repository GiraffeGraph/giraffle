import { hashToken } from "./routes/auth.ts";
import type { AccessTokenRow } from "./storage/queries.ts";

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  accessTokens: AccessTokenRow[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const CONFIG_VAULT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const CONFIG_TOKEN = /^[A-Za-z0-9._~+/=-]{32,512}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: parsePort(env.PORT),
    databasePath: env.DATABASE_PATH?.trim() || "./data/giraffle-sync.db",
    accessTokens: parseAccessTokens(env.SYNC_TOKENS),
  };
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) return 8787;
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

/**
 * `SYNC_TOKENS` is a comma-separated list of `vaultId:token` pairs. The vault id
 * cannot contain a colon so the first colon is an unambiguous separator, and only
 * the SHA-256 digest ever leaves this function.
 */
function parseAccessTokens(value: string | undefined): AccessTokenRow[] {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new ConfigError("SYNC_TOKENS must define at least one vaultId:token pair");
  }

  const tokens: AccessTokenRow[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 0) {
      throw new ConfigError("Each SYNC_TOKENS entry must be formatted as vaultId:token");
    }

    const vaultId = entry.slice(0, separator);
    const token = entry.slice(separator + 1);

    if (!CONFIG_VAULT_ID.test(vaultId)) {
      throw new ConfigError(
        "SYNC_TOKENS vault ids must be 1-128 characters of A-Z a-z 0-9 . _ -",
      );
    }
    if (!CONFIG_TOKEN.test(token)) {
      throw new ConfigError(
        "SYNC_TOKENS tokens must be 32-512 URL-safe characters; generate one with `openssl rand -base64 48`",
      );
    }

    const tokenHash = hashToken(token);
    if (seen.has(tokenHash)) {
      throw new ConfigError("SYNC_TOKENS contains a duplicate token");
    }
    seen.add(tokenHash);
    tokens.push({ tokenHash, vaultId });
  }

  return tokens;
}
