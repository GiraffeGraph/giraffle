"use client";

import { generateId } from "@/lib/utils";
import {
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  type LocalSyncQueueItem,
} from "@/lib/workspace-preferences";

function readQueue(): LocalSyncQueueItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(LOCAL_SYNC_QUEUE_STORAGE_KEY);
    return storedValue ? (JSON.parse(storedValue) as LocalSyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: LocalSyncQueueItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_SYNC_QUEUE_STORAGE_KEY,
    JSON.stringify(queue)
  );
}

export function queueLocalMutation(input: {
  entityType: LocalSyncQueueItem["entityType"];
  entityId: string;
  actionType: string;
  payload?: unknown;
}) {
  const queue = readQueue();
  const entry: LocalSyncQueueItem = {
    id: generateId(),
    entityType: input.entityType,
    entityId: input.entityId,
    actionType: input.actionType,
    queuedAt: new Date().toISOString(),
    payload: input.payload,
  };

  writeQueue([...queue, entry]);
  return entry.id;
}

export function resolveLocalMutation(entryId: string) {
  const queue = readQueue().filter((entry) => entry.id !== entryId);
  writeQueue(queue);
}
