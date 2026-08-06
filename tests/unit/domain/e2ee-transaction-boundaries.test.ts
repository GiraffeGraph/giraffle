import { beforeAll, describe, expect, it } from "vitest";
import {
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@giraffle/protocol";
import {
  createSyncRecord,
  hashSignedSyncRecord,
  openSyncRecord,
  zeroRecordHash,
  type SignedSyncRecordV1,
  type SyncOperationV1,
} from "@giraffle/protocol";

interface DurableClientState {
  title: string | null;
  localArchive: SignedSyncRecordV1[];
  outbox: string[];
  localDeviceSequence: number;
  localDeviceHead: Uint8Array;
  remoteArchive: SignedSyncRecordV1[];
  remoteDeviceSequence: number;
  remoteDeviceHead: Uint8Array;
  pullCursor: number;
}

class InjectedCrash extends Error {}

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

function initialState(): DurableClientState {
  return {
    title: null,
    localArchive: [],
    outbox: [],
    localDeviceSequence: 0,
    localDeviceHead: zeroRecordHash(),
    remoteArchive: [],
    remoteDeviceSequence: 0,
    remoteDeviceHead: zeroRecordHash(),
    pullCursor: 0,
  };
}

function runAtomicTransaction(
  durable: DurableClientState,
  steps: Array<(working: DurableClientState) => void>,
  crashAfterStep?: number,
) {
  const working = structuredClone(durable);
  for (const [index, step] of steps.entries()) {
    step(working);
    if (index === crashAfterStep) {
      throw new InjectedCrash();
    }
  }
  return working;
}

describe("local sync transaction crash boundaries", () => {
  let crypto: E2eeCryptoProvider;
  let localKeys: SigningKeyPair;
  let remoteKeys: SigningKeyPair;
  const contentKey = fixedBytes(32, 0x10);
  const locatorKey = fixedBytes(32, 0x60);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    localKeys = crypto.signingKeyPairFromSeed(fixedBytes(32, 0xa0));
    remoteKeys = crypto.signingKeyPairFromSeed(fixedBytes(32, 0xc0));
  });

  it("never exposes a partial local write at any transaction boundary", () => {
    const before = initialState();
    const record = createSyncRecord(crypto, {
      recordId: "local-1",
      vaultId: "vault-1",
      deviceId: "device-local",
      deviceSequence: 1,
      previousRecordHash: before.localDeviceHead,
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: localKeys.privateKey,
      operation: operation("local-1", "Local title"),
    });
    const nextHead = hashSignedSyncRecord(crypto, record);
    const steps: Array<(working: DurableClientState) => void> = [
      (working) => {
        working.title = "Local title";
      },
      (working) => {
        working.localArchive.push(record);
      },
      (working) => {
        working.outbox.push(record.recordId);
      },
      (working) => {
        working.localDeviceSequence = 1;
      },
      (working) => {
        working.localDeviceHead = nextHead;
      },
    ];

    for (let crashAfterStep = 0; crashAfterStep < steps.length; crashAfterStep += 1) {
      expect(() =>
        runAtomicTransaction(before, steps, crashAfterStep),
      ).toThrow(InjectedCrash);
      expect(before).toEqual(initialState());
    }

    const committed = runAtomicTransaction(before, steps);
    expect(committed.title).toBe("Local title");
    expect(committed.localArchive).toHaveLength(1);
    expect(committed.outbox).toEqual(["local-1"]);
    expect(committed.localDeviceSequence).toBe(1);
    expect(committed.localDeviceHead).toEqual(nextHead);
  });

  it("advances remote chain state and pull cursor only with the applied mutation", () => {
    const before = initialState();
    const record = createSyncRecord(crypto, {
      recordId: "remote-1",
      vaultId: "vault-1",
      deviceId: "device-remote",
      deviceSequence: 1,
      previousRecordHash: before.remoteDeviceHead,
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: remoteKeys.privateKey,
      operation: operation("remote-1", "Remote title"),
    });
    const decrypted = openSyncRecord(crypto, record, {
      contentKey,
      locatorKey,
      signingPublicKey: remoteKeys.publicKey,
    });
    const nextHead = hashSignedSyncRecord(crypto, record);
    const steps: Array<(working: DurableClientState) => void> = [
      (working) => {
        working.title = decrypted.mutation.data as string;
      },
      (working) => {
        working.remoteArchive.push(record);
      },
      (working) => {
        working.remoteDeviceSequence = record.deviceSequence;
        working.remoteDeviceHead = nextHead;
      },
      (working) => {
        working.pullCursor = 75;
      },
    ];

    for (let crashAfterStep = 0; crashAfterStep < steps.length; crashAfterStep += 1) {
      expect(() =>
        runAtomicTransaction(before, steps, crashAfterStep),
      ).toThrow(InjectedCrash);
      expect(before.pullCursor).toBe(0);
      expect(before.title).toBeNull();
      expect(before.remoteArchive).toHaveLength(0);
    }

    const committed = runAtomicTransaction(before, steps);
    expect(committed.title).toBe("Remote title");
    expect(committed.pullCursor).toBe(75);
    expect(committed.remoteDeviceSequence).toBe(1);
    expect(committed.remoteDeviceHead).toEqual(nextHead);
  });

  it("does not begin persistence when encryption fails", () => {
    const before = initialState();

    expect(() =>
      createSyncRecord(crypto, {
        recordId: "invalid-local",
        vaultId: "vault-1",
        deviceId: "device-local",
        deviceSequence: 1,
        previousRecordHash: before.localDeviceHead,
        keyEpoch: 1,
        contentKey: new Uint8Array(31),
        locatorKey,
        signingPrivateKey: localKeys.privateKey,
        operation: operation("invalid-local", "Never committed"),
      }),
    ).toThrow();
    expect(before).toEqual(initialState());
  });
});
