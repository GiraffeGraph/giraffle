import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { resolveMcpBearerToken } from "@/domain/mcp/token.service";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

export async function authorizeBlindVault(request: Request, vaultId: string) {
  if (!IDENTIFIER.test(vaultId)) {
    return { error: Response.json({ error: "Invalid vault identifier" }, { status: 400 }) } as const;
  }
  const token = await resolveMcpBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="giraffle-sync"' } }) } as const;
  }
  const rate = consumeRateLimit(`blind-sync:${token.tokenId}`, { limit: 120, windowMs: 60_000, blockMs: 60_000 });
  if (!rate.allowed) {
    return { error: Response.json({ error: "Sync rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }) } as const;
  }
  const vault = await db.blindVault.findUnique({ where: { id: vaultId }, select: { id: true, ownerId: true, protocolVersion: true } });
  if (vault && vault.ownerId !== token.userId) {
    return { error: Response.json({ error: "Vault not found" }, { status: 404 }) } as const;
  }
  return { token, vault } as const;
}

export function decodeBoundedBase64(value: unknown, maximumBytes: number) {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(maximumBytes * 4 / 3) + 8 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new Error("Invalid encoded binary payload");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.length > maximumBytes) throw new Error("Binary payload exceeds limit");
  return decoded;
}

export function encodeBase64(value: Uint8Array) { return Buffer.from(value).toString("base64url"); }
