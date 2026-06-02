import crypto from "node:crypto";
import { db } from "@/lib/db";
import { recordOperation } from "@/domain/sync/operation-log.service";
import type { CreatedMcpAccessToken, McpAccessTokenSummary } from "./token.types";

const MCP_TOKEN_PREFIX = "gfl_mcp_";
const DEFAULT_TOKEN_NAME = "MCP access token";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function createRawToken() {
  return `${MCP_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function toSummary(row: {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): McpAccessTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export async function createMcpAccessToken(
  userId: string,
  input: {
    name?: string;
    expiresAt?: Date | null;
    // Ephemeral per-run agent tokens set this false to keep the operation log
    // free of create/revoke churn (one pair per agent run otherwise).
    audit?: boolean;
  } = {},
): Promise<CreatedMcpAccessToken> {
  const name = input.name?.trim() || DEFAULT_TOKEN_NAME;
  const token = createRawToken();
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 18);

  const row = await db.mcpAccessToken.create({
    data: {
      userId,
      name,
      tokenHash,
      tokenPrefix,
      expiresAt: input.expiresAt ?? null,
    },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  if (input.audit !== false) {
    await recordOperation({
      userId,
      entityType: "mcp-access-token",
      entityId: row.id,
      actionType: "create",
      payload: {
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
    });
  }

  return {
    ...toSummary(row),
    token,
  };
}

export async function listMcpAccessTokens(
  userId: string,
): Promise<McpAccessTokenSummary[]> {
  const rows = await db.mcpAccessToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return rows.map(toSummary);
}

export async function revokeMcpAccessToken(userId: string, tokenId: string) {
  // Atomic conditional update: only the caller that flips revokedAt from null
  // wins, so concurrent revokes (e.g. agent stream close + client disconnect)
  // can't double-write the operation log.
  const result = await db.mcpAccessToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await db.mcpAccessToken.findFirst({
      where: { id: tokenId, userId },
      select: { id: true },
    });
    if (!exists) throw new Error("MCP access token not found");
    return false; // already revoked
  }

  await recordOperation({
    userId,
    entityType: "mcp-access-token",
    entityId: tokenId,
    actionType: "revoke",
  });

  return true;
}

/**
 * Hard-delete a token row (owner-scoped, no audit). Used for ephemeral agent
 * tokens at run end so the table doesn't accumulate revoked rows per run.
 */
export async function deleteMcpAccessToken(userId: string, tokenId: string): Promise<void> {
  await db.mcpAccessToken.deleteMany({ where: { id: tokenId, userId } });
}

export async function resolveMcpBearerToken(authorizationHeader: string | null) {
  const token = parseBearerToken(authorizationHeader);

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const row = await db.mcpAccessToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      name: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row || row.revokedAt) {
    return null;
  }

  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await db.mcpAccessToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    token,
    tokenId: row.id,
    userId: row.userId,
    name: row.name,
  };
}

function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith(MCP_TOKEN_PREFIX)) {
    return null;
  }

  return token;
}
