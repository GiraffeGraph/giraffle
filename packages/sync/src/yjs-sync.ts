import * as Y from "yjs";

export const MAX_YJS_UPDATE_BYTES = 4 * 1024 * 1024;
export const MAX_YJS_BATCH_BYTES = 16 * 1024 * 1024;
export const MAX_YJS_BATCH_UPDATES = 10_000;

export class YjsSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YjsSyncError";
  }
}

function assertYjsUpdate(update: Uint8Array, label = "Yjs update") {
  if (
    !(update instanceof Uint8Array) ||
    update.length === 0 ||
    update.length > MAX_YJS_UPDATE_BYTES
  ) {
    throw new YjsSyncError(`${label} size is invalid`);
  }
}

export function createYjsDocument() {
  return new Y.Doc({ gc: true });
}

export function applyYjsUpdate(document: Y.Doc, update: Uint8Array) {
  assertYjsUpdate(update);
  try {
    Y.applyUpdate(document, update);
  } catch {
    throw new YjsSyncError("Yjs update is malformed");
  }
}

export function mergeYjsUpdates(updates: readonly Uint8Array[]) {
  if (updates.length === 0 || updates.length > MAX_YJS_BATCH_UPDATES) {
    throw new YjsSyncError("Yjs update batch count is invalid");
  }

  let totalBytes = 0;
  for (const [index, update] of updates.entries()) {
    assertYjsUpdate(update, `Yjs update ${index}`);
    totalBytes += update.length;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_YJS_BATCH_BYTES) {
      throw new YjsSyncError("Yjs update batch exceeds the protocol limit");
    }
  }

  try {
    const merged = Y.mergeUpdates([...updates]);
    assertYjsUpdate(merged, "Merged Yjs update");
    return merged;
  } catch (error) {
    if (error instanceof YjsSyncError) {
      throw error;
    }
    throw new YjsSyncError("Yjs update batch is malformed");
  }
}

export function encodeYjsCheckpoint(document: Y.Doc) {
  const update = Y.encodeStateAsUpdate(document);
  assertYjsUpdate(update, "Yjs checkpoint");
  return update;
}

export function encodeYjsStateVector(document: Y.Doc) {
  return Y.encodeStateVector(document);
}

export function encodeYjsDiff(
  document: Y.Doc,
  remoteStateVector: Uint8Array,
) {
  if (
    !(remoteStateVector instanceof Uint8Array) ||
    remoteStateVector.length === 0 ||
    remoteStateVector.length > MAX_YJS_UPDATE_BYTES
  ) {
    throw new YjsSyncError("Yjs state vector size is invalid");
  }

  try {
    const update = Y.encodeStateAsUpdate(document, remoteStateVector);
    assertYjsUpdate(update, "Yjs state diff");
    return update;
  } catch (error) {
    if (error instanceof YjsSyncError) {
      throw error;
    }
    throw new YjsSyncError("Yjs state vector is malformed");
  }
}

