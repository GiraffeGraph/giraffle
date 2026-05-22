"use client";

import { useSyncExternalStore } from "react";
import { generateId } from "@/lib/utils";
import {
  LOCAL_SYNC_QUEUE_STORAGE_KEY,
  type LocalSyncQueueItem,
} from "@/lib/workspace-preferences";

const listeners = new Set<() => void>();
let cachedCount = 0;
let cachedCountLoaded = false;
let storageListenerAttached = false;

function emit() {
  for (const l of listeners) l();
}

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
    JSON.stringify(queue),
  );
  cachedCount = queue.length;
  cachedCountLoaded = true;
  emit();
}

function ensureCachedCount() {
  if (cachedCountLoaded) return;
  cachedCount = readQueue().length;
  cachedCountLoaded = true;
}

function ensureStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== LOCAL_SYNC_QUEUE_STORAGE_KEY) return;
    cachedCount = readQueue().length;
    cachedCountLoaded = true;
    emit();
  });
}

function subscribe(listener: () => void) {
  ensureCachedCount();
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  ensureCachedCount();
  return cachedCount;
}

function getServerSnapshot() {
  return 0;
}

export function useLocalSyncQueueCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
