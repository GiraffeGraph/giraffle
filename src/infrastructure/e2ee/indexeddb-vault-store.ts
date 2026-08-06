import {
  bytesEqual,
  encodeSignedSyncRecord,
  type SignedSyncRecordV1,
} from "@giraffle/protocol";

const DATABASE_VERSION = 1;
const RECORDS_STORE = "records";
const OUTBOX_STORE = "outbox";
const METADATA_STORE = "metadata";
const OPAQUE_STORE = "opaque";
const PULL_CURSOR_KEY = "pullCursor";

interface StoredRecord {
  recordId: string;
  deviceId: string;
  deviceSequence: number;
  bytes: Uint8Array;
  serverSequence: number | null;
}

interface OutboxEntry {
  recordId: string;
  deviceSequence: number;
}

interface MetadataEntry {
  key: string;
  value: number | Uint8Array;
}

interface OpaqueEntry {
  key: string;
  bytes: Uint8Array;
}

export interface IndexedDbDeviceState {
  sequence: number;
  head: Uint8Array;
}

export class IndexedDbVaultStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexedDbVaultStoreError";
  }
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function runTransaction<T>(
  transaction: IDBTransaction,
  operation: () => Promise<T>,
) {
  const done = transactionDone(transaction);
  try {
    const result = await operation();
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The browser may already have aborted or completed the transaction.
    }
    try {
      await done;
    } catch {
      // Preserve the domain error that caused the abort.
    }
    throw error;
  }
}

function sequenceKey(deviceId: string) {
  return `device:${deviceId}:sequence`;
}

function headKey(deviceId: string) {
  return `device:${deviceId}:head`;
}

function assertIdentifier(value: string, label: string) {
  if (
    !value ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new IndexedDbVaultStoreError(`${label} is invalid`);
  }
}

function assertHead(head: Uint8Array) {
  if (!(head instanceof Uint8Array) || head.length !== 32) {
    throw new IndexedDbVaultStoreError("Device chain head must be exactly 32 bytes");
  }
}

export class IndexedDbVaultStore {
  private constructor(
    readonly vaultId: string,
    private readonly database: IDBDatabase,
  ) {}

  static async open(
    vaultId: string,
    indexedDbFactory: IDBFactory = globalThis.indexedDB,
  ) {
    assertIdentifier(vaultId, "vaultId");
    if (!indexedDbFactory) {
      throw new IndexedDbVaultStoreError("IndexedDB is unavailable");
    }

    const request = indexedDbFactory.open(
      `giraffle-encrypted-vault-${vaultId}`,
      DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        const records = database.createObjectStore(RECORDS_STORE, {
          keyPath: "recordId",
        });
        records.createIndex("serverSequence", "serverSequence", {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, {
          keyPath: "recordId",
        });
        outbox.createIndex("deviceSequence", "deviceSequence", {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OPAQUE_STORE)) {
        database.createObjectStore(OPAQUE_STORE, { keyPath: "key" });
      }
    };

    const database = await requestResult(request);
    return new IndexedDbVaultStore(vaultId, database);
  }

  close() {
    this.database.close();
  }

  async commitLocalRecord(
    record: SignedSyncRecordV1,
    nextDeviceHead: Uint8Array,
  ) {
    if (record.vaultId !== this.vaultId) {
      throw new IndexedDbVaultStoreError("Record belongs to another vault");
    }
    assertHead(nextDeviceHead);
    const bytes = encodeSignedSyncRecord(record);
    const transaction = this.database.transaction(
      [RECORDS_STORE, OUTBOX_STORE, METADATA_STORE],
      "readwrite",
    );

    return runTransaction(transaction, async () => {
      const records = transaction.objectStore(RECORDS_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const metadata = transaction.objectStore(METADATA_STORE);
      const existing = (await requestResult(
        records.get(record.recordId),
      )) as StoredRecord | undefined;
      if (existing) {
        if (!bytesEqual(existing.bytes, bytes)) {
          throw new IndexedDbVaultStoreError("Local record ID collision");
        }
        return;
      }

      const sequenceEntry = (await requestResult(
        metadata.get(sequenceKey(record.deviceId)),
      )) as MetadataEntry | undefined;
      const headEntry = (await requestResult(
        metadata.get(headKey(record.deviceId)),
      )) as MetadataEntry | undefined;
      const currentSequence = (sequenceEntry?.value as number | undefined) ?? 0;
      const currentHead =
        (headEntry?.value as Uint8Array | undefined) ?? new Uint8Array(32);
      if (record.deviceSequence !== currentSequence + 1) {
        throw new IndexedDbVaultStoreError("Local device sequence is not contiguous");
      }
      if (!bytesEqual(record.previousRecordHash, currentHead)) {
        throw new IndexedDbVaultStoreError("Local device head does not match record");
      }

      records.put({
        recordId: record.recordId,
        deviceId: record.deviceId,
        deviceSequence: record.deviceSequence,
        bytes,
        serverSequence: null,
      } satisfies StoredRecord);
      outbox.put({
        recordId: record.recordId,
        deviceSequence: record.deviceSequence,
      } satisfies OutboxEntry);
      metadata.put({
        key: sequenceKey(record.deviceId),
        value: record.deviceSequence,
      } satisfies MetadataEntry);
      metadata.put({
        key: headKey(record.deviceId),
        value: nextDeviceHead.slice(),
      } satisfies MetadataEntry);
    });
  }

  async commitPulledRecord(input: {
    serverSequence: number;
    record: SignedSyncRecordV1;
    nextDeviceHead: Uint8Array;
  }) {
    if (
      !Number.isSafeInteger(input.serverSequence) ||
      input.serverSequence <= 0
    ) {
      throw new IndexedDbVaultStoreError("Server sequence is invalid");
    }
    if (input.record.vaultId !== this.vaultId) {
      throw new IndexedDbVaultStoreError("Record belongs to another vault");
    }
    assertHead(input.nextDeviceHead);

    const bytes = encodeSignedSyncRecord(input.record);
    const transaction = this.database.transaction(
      [RECORDS_STORE, OUTBOX_STORE, METADATA_STORE],
      "readwrite",
    );
    return runTransaction(transaction, async () => {
      const records = transaction.objectStore(RECORDS_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const metadata = transaction.objectStore(METADATA_STORE);
      const cursorEntry = (await requestResult(
        metadata.get(PULL_CURSOR_KEY),
      )) as MetadataEntry | undefined;
      const cursor = (cursorEntry?.value as number | undefined) ?? 0;
      if (input.serverSequence <= cursor) {
        return;
      }
      if (input.serverSequence !== cursor + 1) {
        throw new IndexedDbVaultStoreError("Pull cursor cannot skip server records");
      }

      const existing = (await requestResult(
        records.get(input.record.recordId),
      )) as StoredRecord | undefined;
      if (existing && !bytesEqual(existing.bytes, bytes)) {
        throw new IndexedDbVaultStoreError("Pulled record ID collision");
      }

      if (!existing) {
        const sequenceEntry = (await requestResult(
          metadata.get(sequenceKey(input.record.deviceId)),
        )) as MetadataEntry | undefined;
        const headEntry = (await requestResult(
          metadata.get(headKey(input.record.deviceId)),
        )) as MetadataEntry | undefined;
        const currentSequence = (sequenceEntry?.value as number | undefined) ?? 0;
        const currentHead =
          (headEntry?.value as Uint8Array | undefined) ?? new Uint8Array(32);
        if (input.record.deviceSequence !== currentSequence + 1) {
          throw new IndexedDbVaultStoreError(
            "Pulled device sequence is not contiguous",
          );
        }
        if (!bytesEqual(input.record.previousRecordHash, currentHead)) {
          throw new IndexedDbVaultStoreError(
            "Pulled device head does not match record",
          );
        }
        metadata.put({
          key: sequenceKey(input.record.deviceId),
          value: input.record.deviceSequence,
        } satisfies MetadataEntry);
        metadata.put({
          key: headKey(input.record.deviceId),
          value: input.nextDeviceHead.slice(),
        } satisfies MetadataEntry);
      }

      records.put({
        recordId: input.record.recordId,
        deviceId: input.record.deviceId,
        deviceSequence: input.record.deviceSequence,
        bytes,
        serverSequence: input.serverSequence,
      } satisfies StoredRecord);
      outbox.delete(input.record.recordId);
      metadata.put({
        key: PULL_CURSOR_KEY,
        value: input.serverSequence,
      } satisfies MetadataEntry);
    });
  }

  async acknowledgePushedRecord(recordId: string, serverSequence: number) {
    assertIdentifier(recordId, "recordId");
    if (!Number.isSafeInteger(serverSequence) || serverSequence <= 0) {
      throw new IndexedDbVaultStoreError("Server sequence is invalid");
    }
    const transaction = this.database.transaction(
      [RECORDS_STORE, OUTBOX_STORE],
      "readwrite",
    );
    return runTransaction(transaction, async () => {
      const records = transaction.objectStore(RECORDS_STORE);
      const stored = (await requestResult(
        records.get(recordId),
      )) as StoredRecord | undefined;
      if (!stored) {
        throw new IndexedDbVaultStoreError("Cannot acknowledge an unknown record");
      }
      if (
        stored.serverSequence !== null &&
        stored.serverSequence !== serverSequence
      ) {
        throw new IndexedDbVaultStoreError(
          "Record was acknowledged with a different server sequence",
        );
      }
      records.put({ ...stored, serverSequence } satisfies StoredRecord);
      transaction.objectStore(OUTBOX_STORE).delete(recordId);
    });
  }

  async listOutboxRecordBytes() {
    const transaction = this.database.transaction(
      [RECORDS_STORE, OUTBOX_STORE],
      "readonly",
    );
    return runTransaction(transaction, async () => {
      const entries = (await requestResult(
        transaction.objectStore(OUTBOX_STORE).getAll(),
      )) as OutboxEntry[];
      entries.sort((left, right) => left.deviceSequence - right.deviceSequence);
      const records = transaction.objectStore(RECORDS_STORE);
      const result: Uint8Array[] = [];
      for (const entry of entries) {
        const record = (await requestResult(
          records.get(entry.recordId),
        )) as StoredRecord | undefined;
        if (!record) {
          throw new IndexedDbVaultStoreError(
            "Outbox references a missing encrypted record",
          );
        }
        result.push(record.bytes.slice());
      }
      return result;
    });
  }

  async getPullCursor() {
    const transaction = this.database.transaction(METADATA_STORE, "readonly");
    return runTransaction(transaction, async () => {
      const entry = (await requestResult(
        transaction.objectStore(METADATA_STORE).get(PULL_CURSOR_KEY),
      )) as MetadataEntry | undefined;
      return (entry?.value as number | undefined) ?? 0;
    });
  }

  async getDeviceState(deviceId: string): Promise<IndexedDbDeviceState> {
    assertIdentifier(deviceId, "deviceId");
    const transaction = this.database.transaction(METADATA_STORE, "readonly");
    return runTransaction(transaction, async () => {
      const metadata = transaction.objectStore(METADATA_STORE);
      const sequence = (await requestResult(
        metadata.get(sequenceKey(deviceId)),
      )) as MetadataEntry | undefined;
      const head = (await requestResult(
        metadata.get(headKey(deviceId)),
      )) as MetadataEntry | undefined;
      return {
        sequence: (sequence?.value as number | undefined) ?? 0,
        head: ((head?.value as Uint8Array | undefined) ?? new Uint8Array(32)).slice(),
      };
    });
  }

  async putOpaqueEncryptedBytes(key: string, bytes: Uint8Array) {
    assertIdentifier(key, "opaque key");
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      throw new IndexedDbVaultStoreError("Opaque encrypted bytes are invalid");
    }
    const transaction = this.database.transaction(OPAQUE_STORE, "readwrite");
    return runTransaction(transaction, async () => {
      transaction.objectStore(OPAQUE_STORE).put({
        key,
        bytes: bytes.slice(),
      } satisfies OpaqueEntry);
    });
  }

  async getOpaqueEncryptedBytes(key: string) {
    assertIdentifier(key, "opaque key");
    const transaction = this.database.transaction(OPAQUE_STORE, "readonly");
    return runTransaction(transaction, async () => {
      const entry = (await requestResult(
        transaction.objectStore(OPAQUE_STORE).get(key),
      )) as OpaqueEntry | undefined;
      return entry?.bytes.slice();
    });
  }
}
