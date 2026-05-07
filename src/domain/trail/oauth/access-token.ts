import { db } from "@/lib/db";
import { decryptSecretValue, encryptSecretValue } from "@/lib/secret-box";
import { logger } from "@/lib/logger";
import { getOAuthConfig } from "./providers";
import { refreshAccessToken } from "./exchange";
import { updateTrail } from "@/domain/trail/trail.service";
import type { TrailKind } from "@/domain/trail/trail.types";

interface StoredOAuthSecret {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  tokenType: string;
  rawWorkspace?: Record<string, unknown>;
}

interface OAuthCredentialMetadata {
  scope?: string;
  expiresAt?: number;
  workspace?: Record<string, unknown>;
  [k: string]: unknown;
}

const SCOPE_NAME = "oauth";
const REFRESH_LEAD_MS = 60_000;

export async function persistOAuthTokens(input: {
  userId: string;
  trailId: string;
  tokens: {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number | null;
    scope: string | null;
    tokenType: string;
    raw: Record<string, unknown>;
  };
  preserveRefreshIfMissing?: boolean;
}): Promise<void> {
  let nextRefresh = input.tokens.refreshToken ?? null;
  let nextWorkspace: Record<string, unknown> | undefined;
  const expiresAt = input.tokens.expiresIn
    ? Date.now() + input.tokens.expiresIn * 1000
    : null;

  if (input.preserveRefreshIfMissing && !nextRefresh) {
    const existing = await readOAuthSecret(input);
    if (existing?.refreshToken) nextRefresh = existing.refreshToken;
  }

  const raw = input.tokens.raw;
  if (raw && typeof raw === "object") {
    if ("workspace_id" in raw || "workspace_name" in raw || "bot_id" in raw) {
      nextWorkspace = {
        workspaceId: raw.workspace_id,
        workspaceName: raw.workspace_name,
        workspaceIcon: raw.workspace_icon,
        botId: raw.bot_id,
        owner: raw.owner,
      };
    }
  }

  const stored: StoredOAuthSecret = {
    accessToken: input.tokens.accessToken,
    refreshToken: nextRefresh,
    expiresAt,
    scope: input.tokens.scope,
    tokenType: input.tokens.tokenType,
    rawWorkspace: nextWorkspace,
  };

  const metadata: OAuthCredentialMetadata = {
    scope: input.tokens.scope ?? undefined,
    expiresAt: expiresAt ?? undefined,
    workspace: nextWorkspace,
  };

  await db.trailCredential.upsert({
    where: { trailId_scope: { trailId: input.trailId, scope: SCOPE_NAME } },
    create: {
      trailId: input.trailId,
      scope: SCOPE_NAME,
      encryptedSecret: encryptSecretValue(JSON.stringify(stored)),
      metadata: metadata as never,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    update: {
      encryptedSecret: encryptSecretValue(JSON.stringify(stored)),
      metadata: metadata as never,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
}

async function readOAuthSecret(input: {
  userId: string;
  trailId: string;
}): Promise<StoredOAuthSecret | null> {
  const row = await db.trailCredential.findFirst({
    where: {
      scope: SCOPE_NAME,
      trailId: input.trailId,
      trail: { userId: input.userId },
    },
    select: { encryptedSecret: true },
  });
  if (!row) return null;
  try {
    return JSON.parse(decryptSecretValue(row.encryptedSecret)) as StoredOAuthSecret;
  } catch (error) {
    logger.error("oauth_secret_decrypt_failed", { trailId: input.trailId, error });
    return null;
  }
}

export async function getValidAccessToken(input: {
  userId: string;
  trailId: string;
  trailKind: TrailKind;
}): Promise<string> {
  const stored = await readOAuthSecret(input);
  if (!stored) throw new Error("Trail not connected");
  const expiresAt = stored.expiresAt ?? null;
  const needsRefresh =
    expiresAt !== null && expiresAt - REFRESH_LEAD_MS < Date.now();
  if (!needsRefresh) return stored.accessToken;

  if (!stored.refreshToken) {
    await updateTrail(input.userId, input.trailId, {
      status: "error",
      lastError: "Access token expired and no refresh token is stored.",
    });
    throw new Error("Trail access token expired");
  }
  const config = getOAuthConfig(input.trailKind);
  if (!config) throw new Error(`Unknown OAuth trail kind: ${input.trailKind}`);

  try {
    const tokens = await refreshAccessToken({
      config,
      refreshToken: stored.refreshToken,
    });
    await persistOAuthTokens({
      userId: input.userId,
      trailId: input.trailId,
      tokens,
      preserveRefreshIfMissing: true,
    });
    return tokens.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTrail(input.userId, input.trailId, {
      status: "error",
      lastError: `Refresh failed: ${message}`,
    });
    throw error;
  }
}

export async function readOAuthMetadata(input: {
  userId: string;
  trailId: string;
}): Promise<OAuthCredentialMetadata | null> {
  const row = await db.trailCredential.findFirst({
    where: {
      scope: SCOPE_NAME,
      trailId: input.trailId,
      trail: { userId: input.userId },
    },
    select: { metadata: true },
  });
  if (!row) return null;
  return (row.metadata ?? {}) as OAuthCredentialMetadata;
}
