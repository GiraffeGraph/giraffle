import { IDBFactory } from "fake-indexeddb";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@giraffle/protocol";
import {
  createSyncRecord,
  decodeSignedSyncRecord,
  hashSignedSyncRecord,
  zeroRecordHash,
  type SyncOperationV1,
} from "@giraffle/protocol";
import {
  IndexedDbVaultStore,
  IndexedDbVaultStoreError,
} from "@/infrastructure/e2ee/indexeddb-vault-store";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

function operation(recordId: string, title: string): SyncOperationV1 {
  return {
    protocolVersion: 1,
    operationId: recordId,
    objectId: "note-1",
    objectType: "note-metadata",
    schemaVersion: 1,
    clock: { physicalMs: 1_700_000_000_000, logical: 0 },
    mutation: { kind: "set-title", data: title },
  };
}

describe("IndexedDB encrypted vault store", () => {
  let crypto: E2eeCryptoProvider;
  let deviceA: SigningKeyPair;
  let deviceB: SigningKeyPair;
  const contentKey = fixedBytes(32, 0x10);
  const locatorKey = fixedBytes(32, 0x60);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    deviceA = crypto.signingKeyPairFromSeed(fixedBytes(32, 0xa0));
    deviceB = crypto.signingKeyPairFromSeed(fixedBytes(32, 0xc0));
  });

  function record(input: {
    recordId: string;
    deviceId: string;
    sequence: number;
    previousHead: Uint8Array;
    keys: SigningKeyPair;
    title?: string;
  }) {
    return createSyncRecord(crypto, {
      recordId: input.recordId,
      vaultId: "vault-1",
      deviceId: input.deviceId,
      deviceSequence: input.sequence,
      previousRecordHash: input.previousHead,
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: input.keys.privateKey,
      operation: operation(input.recordId, input.title ?? input.recordId),
    });
  }

  async function openStore() {
    return IndexedDbVaultStore.open("vault-1", new IDBFactory());
  }

  it("atomically archives a local encrypted record, outbox entry, sequence, and head", async () => {
    const store = await openStore();
    const first = record({
      recordId: "local-1",
      deviceId: "device-a",
      sequence: 1,
      previousHead: zeroRecordHash(),
      keys: deviceA,
      title: "plaintext must not be stored",
    });
    const firstHead = hashSignedSyncRecord(crypto, first);

    await store.commitLocalRecord(first, firstHead);

    const outbox = await store.listOutboxRecordBytes();
    expect(outbox).toHaveLength(1);
    expect(decodeSignedSyncRecord(outbox[0]).recordId).toBe("local-1");
    expect(new TextDecoder().decode(outbox[0])).not.toContain(
      "plaintext must not be stored",
    );
    expect(await store.getDeviceState("device-a")).toEqual({
      sequence: 1,
      head: firstHead,
    });
    store.close();
  });

  it("aborts the whole local transaction on a sequence gap or ID collision", async () => {
    const store = await openStore();
    const first = record({
      recordId: "local-1",
      deviceId: "device-a",
      sequence: 1,
      previousHead: zeroRecordHash(),
      keys: deviceA,
    });
    const firstHead = hashSignedSyncRecord(crypto, first);
    await store.commitLocalRecord(first, firstHead);

    const gap = record({
      recordId: "local-3",
      deviceId: "device-a",
      sequence: 3,
      previousHead: firstHead,
      keys: deviceA,
    });
    await expect(
      store.commitLocalRecord(gap, hashSignedSyncRecord(crypto, gap)),
    ).rejects.toThrow(/sequence is not contiguous/);

    const collision = record({
      recordId: "local-1",
      deviceId: "device-a",
      sequence: 1,
      previousHead: zeroRecordHash(),
      keys: deviceA,
      title: "different ciphertext",
    });
    await expect(
      store.commitLocalRecord(
        collision,
        hashSignedSyncRecord(crypto, collision),
      ),
    ).rejects.toThrow(/ID collision/);

    expect(await store.getDeviceState("device-a")).toEqual({
      sequence: 1,
      head: firstHead,
    });
    expect(await store.listOutboxRecordBytes()).toHaveLength(1);
    store.close();
  });

  it("atomically advances remote chain state and pull cursor without skipping", async () => {
    const store = await openStore();
    const first = record({
      recordId: "remote-1",
      deviceId: "device-b",
      sequence: 1,
      previousHead: zeroRecordHash(),
      keys: deviceB,
    });
    const firstHead = hashSignedSyncRecord(crypto, first);
    await store.commitPulledRecord({
      serverSequence: 1,
      record: first,
      nextDeviceHead: firstHead,
    });

    const second = record({
      recordId: "remote-2",
      deviceId: "device-b",
      sequence: 2,
      previousHead: firstHead,
      keys: deviceB,
    });
    await expect(
      store.commitPulledRecord({
        serverSequence: 3,
        record: second,
        nextDeviceHead: hashSignedSyncRecord(crypto, second),
      }),
    ).rejects.toThrow(/cannot skip/);

    expect(await store.getPullCursor()).toBe(1);
    expect(await store.getDeviceState("device-b")).toEqual({
      sequence: 1,
      head: firstHead,
    });
    store.close();
  });

  it("turns a pulled local record into an idempotent outbox acknowledgement", async () => {
    const store = await openStore();
    const local = record({
      recordId: "local-roundtrip",
      deviceId: "device-a",
      sequence: 1,
      previousHead: zeroRecordHash(),
      keys: deviceA,
    });
    const head = hashSignedSyncRecord(crypto, local);
    await store.commitLocalRecord(local, head);
    await store.commitPulledRecord({
      serverSequence: 1,
      record: local,
      nextDeviceHead: head,
    });

    expect(await store.listOutboxRecordBytes()).toHaveLength(0);
    expect(await store.getPullCursor()).toBe(1);
    expect(await store.getDeviceState("device-a")).toEqual({
      sequence: 1,
      head,
    });
    store.close();
  });

  it("stores only opaque encrypted wrapper/checkpoint bytes", async () => {
    const store = await openStore();
    const encrypted = fixedBytes(64, 0x20);

    await store.putOpaqueEncryptedBytes("checkpoint:latest", encrypted);
    expect(await store.getOpaqueEncryptedBytes("checkpoint:latest")).toEqual(
      encrypted,
    );
    expect(await store.getOpaqueEncryptedBytes("missing")).toBeUndefined();
    await expect(
      store.putOpaqueEncryptedBytes("invalid", new Uint8Array()),
    ).rejects.toThrow(IndexedDbVaultStoreError);
    store.close();
  });
});
