"use server";

import { db } from "@/lib/db";

export interface OperationLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  payload: unknown;
  source: string;
  createdAt: Date;
  appliedAt: Date | null;
}

export async function recordOperation(input: {
  userId: string;
  entityType: string;
  entityId: string;
  actionType: string;
  payload?: unknown;
  source?: string;
}) {
  return db.operationLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: input.actionType,
      payload: (input.payload ?? {}) as object,
      source: input.source ?? "server",
      appliedAt: new Date(),
    },
  });
}

export async function getRecentOperationLogs(
  userId: string,
  limit = 50
): Promise<OperationLogEntry[]> {
  return db.operationLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      actionType: true,
      payload: true,
      source: true,
      createdAt: true,
      appliedAt: true,
    },
  });
}
