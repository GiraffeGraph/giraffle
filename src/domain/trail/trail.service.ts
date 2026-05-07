import { db } from "@/lib/db";
import { decryptSecretValue, encryptSecretValue } from "@/lib/secret-box";
import { logger } from "@/lib/logger";
import {
  TRAIL_KIND_CATALOG,
  type TrailDetail,
  type TrailKind,
  type TrailStatus,
  type TrailSummary,
} from "./trail.types";

function rowToSummary(row: {
  id: string;
  kind: string;
  label: string | null;
  status: string;
  lastError: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TrailSummary {
  return {
    id: row.id,
    kind: row.kind as TrailKind,
    label: row.label,
    status: row.status as TrailStatus,
    lastError: row.lastError,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTrails(userId: string): Promise<TrailSummary[]> {
  const rows = await db.trail.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      kind: true,
      label: true,
      status: true,
      lastError: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map(rowToSummary);
}

export async function getTrailDetail(
  userId: string,
  trailId: string,
): Promise<TrailDetail | null> {
  const row = await db.trail.findFirst({
    where: { id: trailId, userId },
    select: {
      id: true,
      kind: true,
      label: true,
      status: true,
      config: true,
      lastError: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
      toolAllows: { select: { toolName: true, allowed: true } },
      credentials: { select: { id: true } },
    },
  });
  if (!row) return null;
  return {
    ...rowToSummary(row),
    config: (row.config ?? {}) as Record<string, unknown>,
    toolAllows: row.toolAllows,
    hasCredential: row.credentials.length > 0,
  };
}

export async function createTrail(input: {
  userId: string;
  kind: TrailKind;
  label?: string | null;
  config?: Record<string, unknown>;
  status?: TrailStatus;
}): Promise<TrailSummary> {
  if (!TRAIL_KIND_CATALOG[input.kind]) {
    throw new Error(`Unknown trail kind: ${input.kind}`);
  }
  const row = await db.trail.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      label: input.label ?? null,
      config: (input.config ?? {}) as never,
      status: input.status ?? "disconnected",
    },
    select: {
      id: true,
      kind: true,
      label: true,
      status: true,
      lastError: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rowToSummary(row);
}

export async function updateTrail(
  userId: string,
  trailId: string,
  patch: {
    label?: string | null;
    config?: Record<string, unknown>;
    status?: TrailStatus;
    lastError?: string | null;
    lastSyncAt?: Date | null;
  },
): Promise<TrailSummary | null> {
  const result = await db.trail.updateMany({
    where: { id: trailId, userId },
    data: {
      label: patch.label,
      config: patch.config as never,
      status: patch.status,
      lastError: patch.lastError,
      lastSyncAt: patch.lastSyncAt,
    },
  });
  if (result.count === 0) return null;
  const row = await db.trail.findFirst({
    where: { id: trailId, userId },
    select: {
      id: true,
      kind: true,
      label: true,
      status: true,
      lastError: true,
      lastSyncAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row ? rowToSummary(row) : null;
}

export async function deleteTrail(userId: string, trailId: string): Promise<boolean> {
  const result = await db.trail.deleteMany({ where: { id: trailId, userId } });
  return result.count > 0;
}

export async function setTrailCredential(input: {
  userId: string;
  trailId: string;
  scope?: string;
  secret: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}): Promise<void> {
  const owned = await db.trail.findFirst({
    where: { id: input.trailId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) throw new Error("Trail not found");

  const scope = input.scope ?? "default";
  const encryptedSecret = encryptSecretValue(input.secret);
  await db.trailCredential.upsert({
    where: { trailId_scope: { trailId: input.trailId, scope } },
    create: {
      trailId: input.trailId,
      scope,
      encryptedSecret,
      metadata: (input.metadata ?? {}) as never,
      expiresAt: input.expiresAt ?? null,
    },
    update: {
      encryptedSecret,
      metadata: (input.metadata ?? {}) as never,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export async function readTrailCredential(input: {
  userId: string;
  trailId: string;
  scope?: string;
}): Promise<{ secret: string; metadata: Record<string, unknown> } | null> {
  const scope = input.scope ?? "default";
  const row = await db.trailCredential.findFirst({
    where: {
      scope,
      trailId: input.trailId,
      trail: { userId: input.userId },
    },
    select: { encryptedSecret: true, metadata: true },
  });
  if (!row) return null;
  try {
    return {
      secret: decryptSecretValue(row.encryptedSecret),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    logger.error("trail_credential_decrypt_failed", { trailId: input.trailId, error });
    return null;
  }
}

export async function setToolAllow(input: {
  userId: string;
  trailId: string;
  toolName: string;
  allowed: boolean;
}): Promise<void> {
  const owned = await db.trail.findFirst({
    where: { id: input.trailId, userId: input.userId },
    select: { id: true },
  });
  if (!owned) throw new Error("Trail not found");
  await db.trailToolAllow.upsert({
    where: { trailId_toolName: { trailId: input.trailId, toolName: input.toolName } },
    create: {
      trailId: input.trailId,
      toolName: input.toolName,
      allowed: input.allowed,
    },
    update: { allowed: input.allowed },
  });
}

export interface TrailLogEntry {
  id: string;
  toolName: string;
  status: string;
  trailId: string | null;
  sessionId: string | null;
  durationMs: number | null;
  error: string | null;
  outputSnippet: string | null;
  input: unknown;
  createdAt: string;
}

export async function listTrailLogs(input: {
  userId: string;
  trailId?: string;
  limit?: number;
}): Promise<TrailLogEntry[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const rows = await db.trailLog.findMany({
    where: {
      userId: input.userId,
      ...(input.trailId ? { trailId: input.trailId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      toolName: true,
      status: true,
      trailId: true,
      sessionId: true,
      durationMs: true,
      error: true,
      outputSnippet: true,
      input: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
