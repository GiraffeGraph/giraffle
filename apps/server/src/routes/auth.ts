import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { consumeRateLimit } from "../rate-limit.ts";
import type { DeviceRow, Store, VaultRow } from "../storage/queries.ts";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

export const DEVICE_HEADER = "X-Giraffle-Device-Id";

export const SYNC_RATE_LIMIT = { limit: 120, windowMs: 60_000, blockMs: 60_000 } as const;

export interface AuthorizedVault {
  tokenHash: string;
  vaultId: string;
  vault: VaultRow | null;
}

export interface AppEnv {
  Variables: {
    auth: AuthorizedVault;
    device: DeviceRow;
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function rateLimitKey(tokenHash: string): string {
  return `blind-sync:${tokenHash}`;
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Authorizes a vault-scoped bearer token. A token that belongs to a different
 * vault answers 404 rather than 403, which keeps the response from revealing
 * which vaults this relay hosts.
 */
export function vaultAuth(store: Store): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const vaultId = c.req.param("vaultId") ?? "";
    if (!IDENTIFIER.test(vaultId)) {
      return c.json({ error: "Invalid vault identifier" }, 400);
    }

    const presented = parseBearerToken(c.req.header("authorization"));
    const token = presented ? store.findAccessToken(hashToken(presented)) : undefined;
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401, {
        "WWW-Authenticate": 'Bearer realm="giraffle-sync"',
      });
    }

    const rate = consumeRateLimit(rateLimitKey(token.tokenHash), SYNC_RATE_LIMIT);
    if (!rate.allowed) {
      return c.json({ error: "Sync rate limit exceeded" }, 429, {
        "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)),
      });
    }

    if (token.vaultId !== vaultId) {
      return c.json({ error: "Vault not found" }, 404);
    }

    store.touchAccessToken(token.tokenHash);
    c.set("auth", {
      tokenHash: token.tokenHash,
      vaultId,
      vault: store.findVault(vaultId) ?? null,
    });

    await next();
  };
}

/**
 * Record traffic is device-scoped, not token-scoped: the bearer token is an
 * operator credential that every device in the vault shares. A device that is
 * still waiting for approval, or that was revoked, presents a perfectly valid
 * token and must still be turned away here.
 */
export function activeDevice(store: Store): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // An unknown vault is answered by the route, which keeps existence hidden.
    if (!c.get("auth").vault) {
      return next();
    }

    const deviceId = c.req.header(DEVICE_HEADER)?.trim() ?? "";
    if (!IDENTIFIER.test(deviceId)) {
      return c.json({ error: `${DEVICE_HEADER} must identify the calling device` }, 400);
    }

    const device = store.findDevice(deviceId);
    if (
      !device ||
      device.vaultId !== c.get("auth").vaultId ||
      device.status !== "active" ||
      device.revokedAt !== null
    ) {
      return c.json({ error: "This device is not authorized to sync this vault" }, 403);
    }

    c.set("device", device);
    await next();
  };
}
