export type OriginByteStoreBackend = "opfs" | "indexeddb";

export interface OriginByteStore {
  readonly backend: OriginByteStoreBackend;
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

const DIRECTORY = "giraffle";
const DATABASE = "giraffle-origin-store";
const OBJECT_STORE = "bytes";

/**
 * Everything written here is ciphertext. The origin private file system is
 * preferred because it is a real file API — the vault image is rewritten whole
 * on every flush and OPFS does that without copying through structured clone —
 * but Safari only grew `createWritable` recently, so IndexedDB stands in.
 */
function opfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    typeof FileSystemFileHandle.prototype.createWritable === "function"
  );
}

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

async function createOpfsStore(): Promise<OriginByteStore> {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(DIRECTORY, { create: true });

  return {
    backend: "opfs",
    async read(name) {
      try {
        const handle = await directory.getFileHandle(name);
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(name, bytes) {
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      // Copied onto a plain ArrayBuffer: the caller may zeroize its buffer as
      // soon as this resolves, and a shared buffer is not a writable chunk.
      const chunk = new Uint8Array(bytes.length);
      chunk.set(bytes);
      try {
        await writable.write(chunk);
      } finally {
        await writable.close();
      }
    },
    async remove(name) {
      await directory.removeEntry(name).catch(() => undefined);
    },
  };
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Local storage could not be opened"));
  });
}

function runTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, mode);
    const request = action(transaction.objectStore(OBJECT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Local storage request failed"));
  });
}

async function createIndexedDbStore(): Promise<OriginByteStore> {
  const database = await openIndexedDb();

  return {
    backend: "indexeddb",
    async read(name) {
      const value = await runTransaction<unknown>(database, "readonly", (store) =>
        store.get(name),
      );
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      return null;
    },
    async write(name, bytes) {
      // IndexedDB structured-clones the value; the slice keeps the stored copy
      // independent of the buffer the caller is about to zeroize.
      await runTransaction(database, "readwrite", (store) =>
        store.put(bytes.slice(), name),
      );
    },
    async remove(name) {
      await runTransaction(database, "readwrite", (store) => store.delete(name));
    },
  };
}

let pending: Promise<OriginByteStore> | null = null;

export function openOriginByteStore(): Promise<OriginByteStore> {
  pending ??= (async () => {
    if (opfsAvailable()) {
      try {
        return await createOpfsStore();
      } catch {
        // A private window or a denied storage grant leaves OPFS unusable even
        // though its API is present; IndexedDB is still worth trying.
      }
    }
    if (indexedDbAvailable()) return createIndexedDbStore();
    throw new Error(
      "This browser exposes no private storage, so an encrypted vault cannot be kept on this device.",
    );
  })().catch((cause: unknown) => {
    pending = null;
    throw cause;
  });

  return pending;
}
