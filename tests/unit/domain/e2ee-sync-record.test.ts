import { beforeAll, describe, expect, it } from "vitest";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@/domain/e2ee/crypto-provider";
import syncVector from "../../vectors/sync-record-v1.json";
import {
  advanceDeviceChain,
  createDeviceChainState,
  type DeviceChainState,
} from "@/domain/e2ee/device-chain";
import { compareVersionStamps } from "@/domain/e2ee/hybrid-logical-clock";
import {
  MAX_ENCODED_SYNC_RECORD_BYTES,
  MissingKeyEpochError,
  SyncProtocolError,
  SyncSignatureError,
  bytesEqual,
  createSyncRecord,
  decodeSignedSyncRecord,
  encodeSignedSyncRecord,
  encodeUnsignedSyncRecord,
  hashSignedSyncRecord,
  openSyncRecord,
  openSyncRecordWithKeyResolver,
  verifySyncRecord,
  zeroRecordHash,
  type SignedSyncRecordV1,
  type SyncOperationV1,
  type UnsignedSyncRecordV1,
} from "@/domain/e2ee/sync-record";

interface ServerRecord {
  serverSequence: number;
  record: SignedSyncRecordV1;
}

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function titleOperation(input: {
  recordId: string;
  objectId?: string;
  physicalMs: number;
  logical?: number;
  title: string;
}): SyncOperationV1 {
  return {
    protocolVersion: 1,
    operationId: input.recordId,
    objectId: input.objectId ?? "note-1",
    objectType: "note-metadata",
    schemaVersion: 1,
    clock: {
      physicalMs: input.physicalMs,
      logical: input.logical ?? 0,
    },
    mutation: {
      kind: "set-title",
      data: input.title,
    },
  };
}

class InMemoryBlindServer {
  private records: ServerRecord[] = [];
  private devices = new Map<
    string,
    {
      publicKey: Uint8Array;
      chain: DeviceChainState;
      revoked: boolean;
    }
  >();

  constructor(private readonly crypto: E2eeCryptoProvider) {}

  registerDevice(deviceId: string, publicKey: Uint8Array) {
    this.devices.set(deviceId, {
      publicKey,
      chain: createDeviceChainState(deviceId),
      revoked: false,
    });
  }

  revokeDevice(deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new SyncProtocolError("Unknown device");
    }
    device.revoked = true;
  }

  push(record: SignedSyncRecordV1) {
    const duplicate = this.records.find(
      (entry) => entry.record.recordId === record.recordId,
    );
    if (duplicate) {
      if (
        !bytesEqual(
          hashSignedSyncRecord(this.crypto, duplicate.record),
          hashSignedSyncRecord(this.crypto, record),
        )
      ) {
        throw new SyncProtocolError("Record ID collision");
      }
      return duplicate.serverSequence;
    }

    const device = this.devices.get(record.deviceId);
    if (!device) {
      throw new SyncProtocolError("Unknown device");
    }
    if (device.revoked) {
      throw new SyncProtocolError("Device is revoked");
    }

    verifySyncRecord(this.crypto, record, device.publicKey);

    const serverSequence = this.records.length + 1;
    const nextChain = advanceDeviceChain(this.crypto, device.chain, record);
    this.records.push({ serverSequence, record });
    device.chain = nextChain;
    return serverSequence;
  }

  pull(after = 0) {
    return this.records.filter((entry) => entry.serverSequence > after);
  }
}

interface LwwTitle {
  value: string;
  physicalMs: number;
  logical: number;
  deviceId: string;
  operationId: string;
}

function compareLww(left: LwwTitle, right: LwwTitle) {
  return compareVersionStamps(
    {
      clock: { physicalMs: left.physicalMs, logical: left.logical },
      deviceId: left.deviceId,
      operationId: left.operationId,
    },
    {
      clock: { physicalMs: right.physicalMs, logical: right.logical },
      deviceId: right.deviceId,
      operationId: right.operationId,
    },
  );
}

class SimulatedClient {
  private sequence = 0;
  private head: Uint8Array<ArrayBufferLike> = zeroRecordHash();
  private outbox: SignedSyncRecordV1[] = [];
  private seen = new Set<string>();
  private knownSequences = new Map<string, number>();
  private knownHeads = new Map<string, Uint8Array>();
  private pending = new Map<string, Map<number, SignedSyncRecordV1>>();
  private title: LwwTitle | null = null;

  constructor(
    private readonly crypto: E2eeCryptoProvider,
    readonly deviceId: string,
    private readonly keys: SigningKeyPair,
    private readonly devicePublicKeys: Map<string, Uint8Array>,
    private readonly contentKey: Uint8Array,
    private readonly locatorKey: Uint8Array,
  ) {
    this.knownSequences.set(deviceId, 0);
    this.knownHeads.set(deviceId, zeroRecordHash());
  }

  setTitle(recordId: string, value: string, physicalMs: number, logical = 0) {
    this.sequence += 1;
    const operation = titleOperation({
      recordId,
      title: value,
      physicalMs,
      logical,
    });
    const record = createSyncRecord(this.crypto, {
      recordId,
      vaultId: "vault-1",
      deviceId: this.deviceId,
      deviceSequence: this.sequence,
      previousRecordHash: this.head,
      keyEpoch: 1,
      contentKey: this.contentKey,
      locatorKey: this.locatorKey,
      signingPrivateKey: this.keys.privateKey,
      operation,
    });

    this.applyTitle(operation, this.deviceId);
    this.head = hashSignedSyncRecord(this.crypto, record);
    this.knownSequences.set(this.deviceId, this.sequence);
    this.knownHeads.set(this.deviceId, this.head);
    this.seen.add(record.recordId);
    this.outbox.push(record);
    return record;
  }

  flush(server: InMemoryBlindServer) {
    for (const record of this.outbox) {
      server.push(record);
    }
    this.outbox = [];
  }

  ingest(entries: ServerRecord[]) {
    for (const { record } of entries) {
      if (this.seen.has(record.recordId)) {
        continue;
      }
      const bySequence = this.pending.get(record.deviceId) ?? new Map();
      bySequence.set(record.deviceSequence, record);
      this.pending.set(record.deviceId, bySequence);
    }

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [deviceId, records] of this.pending) {
        const expected = (this.knownSequences.get(deviceId) ?? 0) + 1;
        const record = records.get(expected);
        if (!record) {
          continue;
        }

        const expectedHead = this.knownHeads.get(deviceId) ?? zeroRecordHash();
        if (!bytesEqual(record.previousRecordHash, expectedHead)) {
          throw new SyncProtocolError("Client hash-chain mismatch");
        }

        const publicKey = this.devicePublicKeys.get(deviceId);
        if (!publicKey) {
          throw new SyncProtocolError("Client does not trust record device");
        }

        const operation = openSyncRecord(this.crypto, record, {
          contentKey: this.contentKey,
          locatorKey: this.locatorKey,
          signingPublicKey: publicKey,
        });
        this.applyTitle(operation, deviceId);
        this.knownSequences.set(deviceId, record.deviceSequence);
        this.knownHeads.set(deviceId, hashSignedSyncRecord(this.crypto, record));
        this.seen.add(record.recordId);
        records.delete(expected);
        progressed = true;
      }
    }

  }

  hasPendingPredecessors() {
    return [...this.pending.values()].some((records) => records.size > 0);
  }

  getTitle() {
    return this.title?.value ?? null;
  }

  private applyTitle(operation: SyncOperationV1, deviceId: string) {
    if (
      operation.mutation.kind !== "set-title" ||
      typeof operation.mutation.data !== "string"
    ) {
      throw new SyncProtocolError("Unexpected simulator mutation");
    }

    const next: LwwTitle = {
      value: operation.mutation.data,
      physicalMs: operation.clock.physicalMs,
      logical: operation.clock.logical,
      deviceId,
      operationId: operation.operationId,
    };

    if (!this.title || compareLww(next, this.title) > 0) {
      this.title = next;
    }
  }
}

describe("encrypted signed sync records", () => {
  let crypto: E2eeCryptoProvider;
  let deviceA: SigningKeyPair;
  let deviceB: SigningKeyPair;
  const contentKey = fixedBytes(32, 0x00);
  const locatorKey = fixedBytes(32, 0x80);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    deviceA = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x20));
    deviceB = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x40));
  });

  function createRecord() {
    return createSyncRecord(crypto, {
      recordId: "record-a-1",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 1,
      previousRecordHash: zeroRecordHash(),
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: deviceA.privateKey,
      operation: titleOperation({
        recordId: "record-a-1",
        title: "Encrypted title",
        physicalMs: 1_700_000_000_000,
      }),
      nonce: fixedBytes(24, 0xa0),
    });
  }

  it("round-trips a canonical signed record and opens its operation", () => {
    const record = createRecord();
    const bytes = encodeSignedSyncRecord(record);
    const decoded = decodeSignedSyncRecord(bytes);

    expect(toHex(bytes)).toBe(syncVector.encodedRecord);
    expect(toHex(decoded.objectLocator)).toBe(syncVector.objectLocator);
    expect(toHex(hashSignedSyncRecord(crypto, decoded))).toBe(
      syncVector.recordHash,
    );
    expect(encodeSignedSyncRecord(decoded)).toEqual(bytes);
    expect(
      openSyncRecord(crypto, decoded, {
        contentKey,
        locatorKey,
        signingPublicKey: deviceA.publicKey,
      }),
    ).toEqual(
      titleOperation({
        recordId: "record-a-1",
        title: "Encrypted title",
        physicalMs: 1_700_000_000_000,
      }),
    );
  });

  it("rejects ciphertext tampering before decryption", () => {
    const record = structuredClone(createRecord());
    record.envelope.ciphertext[0] ^= 1;

    expect(() =>
      openSyncRecord(crypto, record, {
        contentKey,
        locatorKey,
        signingPublicKey: deviceA.publicKey,
      }),
    ).toThrow(SyncSignatureError);
  });

  it("binds signed headers to ciphertext through AAD", () => {
    const original = createRecord();
    const tampered: SignedSyncRecordV1 = {
      ...structuredClone(original),
      vaultId: "vault-2",
    };
    const { signature: _oldSignature, ...unsigned } = tampered;
    tampered.signature = crypto.sign(
      encodeUnsignedSyncRecord(unsigned as UnsignedSyncRecordV1),
      deviceA.privateKey,
    );

    expect(() =>
      openSyncRecord(crypto, tampered, {
        contentKey,
        locatorKey,
        signingPublicKey: deviceA.publicKey,
      }),
    ).toThrow(CryptoAuthenticationError);
  });

  it("reports a missing key epoch before attempting decryption", () => {
    const record = createRecord();

    expect(() =>
      openSyncRecordWithKeyResolver(crypto, record, {
        locatorKey,
        signingPublicKey: deviceA.publicKey,
        resolveContentKey: () => undefined,
      }),
    ).toThrow(MissingKeyEpochError);
  });

  it("detects the wrong locator key after authenticated decryption", () => {
    expect(() =>
      openSyncRecord(crypto, createRecord(), {
        contentKey,
        locatorKey: fixedBytes(32, 0x90),
        signingPublicKey: deviceA.publicKey,
      }),
    ).toThrow(/Object locator does not match/);
  });

  it("makes duplicate pushes idempotent and rejects device sequence gaps", () => {
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    const record = createRecord();

    expect(server.push(record)).toBe(1);
    expect(server.push(record)).toBe(1);
    expect(server.pull()).toHaveLength(1);

    const collision = structuredClone(record);
    collision.signature[0] ^= 1;
    expect(() => server.push(collision)).toThrow(/Record ID collision/);

    const gapRecord = createSyncRecord(crypto, {
      recordId: "record-a-3",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 3,
      previousRecordHash: hashSignedSyncRecord(crypto, record),
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: deviceA.privateKey,
      operation: titleOperation({
        recordId: "record-a-3",
        title: "Gap",
        physicalMs: 1_700_000_000_003,
      }),
      nonce: fixedBytes(24, 0xc0),
    });

    expect(() => server.push(gapRecord)).toThrow(/Expected device sequence 2/);
  });

  it("rejects new records from a revoked device", () => {
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    server.revokeDevice("device-a");

    expect(() => server.push(createRecord())).toThrow(/Device is revoked/);
  });

  it("rejects a second valid fork at the same device sequence", () => {
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);

    const first = createSyncRecord(crypto, {
      recordId: "fork-a",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 1,
      previousRecordHash: zeroRecordHash(),
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: deviceA.privateKey,
      operation: titleOperation({
        recordId: "fork-a",
        title: "First branch",
        physicalMs: 1,
      }),
    });
    const second = createSyncRecord(crypto, {
      recordId: "fork-b",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 1,
      previousRecordHash: zeroRecordHash(),
      keyEpoch: 1,
      contentKey,
      locatorKey,
      signingPrivateKey: deviceA.privateKey,
      operation: titleOperation({
        recordId: "fork-b",
        title: "Second branch",
        physicalMs: 2,
      }),
    });

    expect(server.push(first)).toBe(1);
    expect(() => server.push(second)).toThrow(/Expected device sequence 2/);
  });

  it("rejects oversized records before CBOR decoding", () => {
    expect(() =>
      decodeSignedSyncRecord(
        new Uint8Array(MAX_ENCODED_SYNC_RECORD_BYTES + 1),
      ),
    ).toThrow(/record size is invalid/);
  });

  it("rejects unversioned extension fields", () => {
    const record = createRecord() as SignedSyncRecordV1 & {
      unexpected?: string;
    };
    record.unexpected = "ambiguous-extension";

    expect(() => encodeSignedSyncRecord(record)).toThrow(/unexpected fields/);
  });

  it("recovers from an interrupted outbox push without skipping sequence", () => {
    const publicKeys = new Map([
      ["device-a", deviceA.publicKey],
      ["device-b", deviceB.publicKey],
    ]);
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    server.registerDevice("device-b", deviceB.publicKey);
    const clientA = new SimulatedClient(
      crypto,
      "device-a",
      deviceA,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const clientB = new SimulatedClient(
      crypto,
      "device-b",
      deviceB,
      publicKeys,
      contentKey,
      locatorKey,
    );

    const first = clientA.setTitle("interrupted-1", "First", 1);
    const second = clientA.setTitle("interrupted-2", "Second", 2);

    expect(() => server.push(second)).toThrow(/Expected device sequence 1/);
    expect(server.push(first)).toBe(1);
    expect(server.push(second)).toBe(2);
    expect(server.push(first)).toBe(1); // retry after an unknown response

    clientB.ingest(server.pull());
    expect(clientB.getTitle()).toBe("Second");
  });

  it("buffers a later pull page until its missing predecessor arrives", () => {
    const publicKeys = new Map([
      ["device-a", deviceA.publicKey],
      ["device-b", deviceB.publicKey],
    ]);
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    server.registerDevice("device-b", deviceB.publicKey);
    const clientA = new SimulatedClient(
      crypto,
      "device-a",
      deviceA,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const clientB = new SimulatedClient(
      crypto,
      "device-b",
      deviceB,
      publicKeys,
      contentKey,
      locatorKey,
    );

    clientA.setTitle("paged-1", "First", 1);
    clientA.setTitle("paged-2", "Second", 2);
    clientA.flush(server);
    const records = server.pull();

    clientB.ingest([records[1]]);
    expect(clientB.hasPendingPredecessors()).toBe(true);
    expect(clientB.getTitle()).toBeNull();

    clientB.ingest([records[0]]);
    expect(clientB.hasPendingPredecessors()).toBe(false);
    expect(clientB.getTitle()).toBe("Second");
  });

  it("converges two offline clients despite duplicate and reordered delivery", () => {
    const publicKeys = new Map([
      ["device-a", deviceA.publicKey],
      ["device-b", deviceB.publicKey],
    ]);
    const clientA = new SimulatedClient(
      crypto,
      "device-a",
      deviceA,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const clientB = new SimulatedClient(
      crypto,
      "device-b",
      deviceB,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    server.registerDevice("device-b", deviceB.publicKey);

    clientA.setTitle("record-a-1", "Title from A", 2_000, 0);
    clientB.setTitle("record-b-1", "Title from B", 2_000, 1);
    clientA.flush(server);
    clientB.flush(server);

    const records = server.pull();
    clientA.ingest([...records].reverse());
    clientA.ingest(records); // duplicate delivery
    clientB.ingest(records);

    expect(clientA.getTitle()).toBe("Title from B");
    expect(clientB.getTitle()).toBe("Title from B");
  });

  it("converges after 10,000 offline writes and shuffled delivery", () => {
    const publicKeys = new Map([
      ["device-a", deviceA.publicKey],
      ["device-b", deviceB.publicKey],
    ]);
    const clientA = new SimulatedClient(
      crypto,
      "device-a",
      deviceA,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const clientB = new SimulatedClient(
      crypto,
      "device-b",
      deviceB,
      publicKeys,
      contentKey,
      locatorKey,
    );
    const server = new InMemoryBlindServer(crypto);
    server.registerDevice("device-a", deviceA.publicKey);
    server.registerDevice("device-b", deviceB.publicKey);

    for (let index = 0; index < 5_000; index += 1) {
      clientA.setTitle(`stress-a-${index}`, `A-${index}`, 10_000 + index, 0);
      clientB.setTitle(`stress-b-${index}`, `B-${index}`, 10_000 + index, 1);
    }
    clientA.flush(server);
    clientB.flush(server);

    const shuffled = [...server.pull(), ...server.pull().slice(0, 20)];
    let seed = 0x5eed1234;
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const target = seed % (index + 1);
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }

    clientA.ingest(shuffled);
    clientB.ingest([...shuffled].reverse());

    expect(clientA.getTitle()).toBe("B-4999");
    expect(clientB.getTitle()).toBe("B-4999");
  }, 30_000);
});
