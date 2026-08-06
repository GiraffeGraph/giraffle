import { createSodiumCryptoProvider } from "@giraffle/protocol/src/sodium-provider";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ContentKeyWrapperError,
  createContentKeyEpoch,
  decodeContentKeyWrapper,
  encodeContentKeyWrapper,
  unwrapContentKey,
  wrapContentKey,
} from "@giraffle/sync";
import {
  CryptoAuthenticationError,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@giraffle/protocol";
import {
  MissingKeyEpochError,
  createSyncRecord,
  hashSignedSyncRecord,
  openSyncRecordWithKeyResolver,
  zeroRecordHash,
  type SyncOperationV1,
} from "@giraffle/protocol";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

function operation(recordId: string): SyncOperationV1 {
  return {
    protocolVersion: 1,
    operationId: recordId,
    objectId: "note-1",
    objectType: "note-metadata",
    schemaVersion: 1,
    clock: { physicalMs: 1_700_000_000_000, logical: 0 },
    mutation: { kind: "set-title", data: recordId },
  };
}

describe("content-key wrapper and epoch rotation", () => {
  let crypto: E2eeCryptoProvider;
  let signingKeys: SigningKeyPair;
  const vaultRootKey = fixedBytes(32, 0x10);
  const contentKey = fixedBytes(32, 0x40);
  const locatorKey = fixedBytes(32, 0x80);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    signingKeys = crypto.signingKeyPairFromSeed(fixedBytes(32, 0xc0));
  });

  it("round-trips a content key through canonical serialization", () => {
    const wrapper = wrapContentKey(crypto, {
      vaultId: "vault-1",
      keyEpoch: 1,
      vaultRootKey,
      contentKey,
    });
    const encoded = encodeContentKeyWrapper(wrapper);
    const decoded = decodeContentKeyWrapper(encoded);

    expect(encodeContentKeyWrapper(decoded)).toEqual(encoded);
    expect(unwrapContentKey(crypto, decoded, vaultRootKey)).toEqual(contentKey);
  });

  it("binds vault and epoch metadata into authenticated data", () => {
    const wrapper = wrapContentKey(crypto, {
      vaultId: "vault-1",
      keyEpoch: 1,
      vaultRootKey,
      contentKey,
    });

    expect(() =>
      unwrapContentKey(
        crypto,
        { ...wrapper, keyEpoch: 2 },
        vaultRootKey,
      ),
    ).toThrow(CryptoAuthenticationError);
    expect(() =>
      unwrapContentKey(crypto, wrapper, fixedBytes(32, 0x20)),
    ).toThrow(CryptoAuthenticationError);
  });

  it("generates independent random keys for successive epochs", () => {
    const first = createContentKeyEpoch(crypto, {
      vaultId: "vault-1",
      keyEpoch: 1,
      vaultRootKey,
    });
    const second = createContentKeyEpoch(crypto, {
      vaultId: "vault-1",
      keyEpoch: 2,
      vaultRootKey,
    });

    expect(first.contentKey).not.toEqual(second.contentKey);
    expect(unwrapContentKey(crypto, first.wrapper, vaultRootKey)).toEqual(
      first.contentKey,
    );
    expect(unwrapContentKey(crypto, second.wrapper, vaultRootKey)).toEqual(
      second.contentKey,
    );
  });

  it("keeps old epochs decryptable while excluding a revoked device from a new epoch", () => {
    const epoch1 = createContentKeyEpoch(crypto, {
      vaultId: "vault-1",
      keyEpoch: 1,
      vaultRootKey,
    });
    const epoch2 = createContentKeyEpoch(crypto, {
      vaultId: "vault-1",
      keyEpoch: 2,
      vaultRootKey,
    });
    const oldRecord = createSyncRecord(crypto, {
      recordId: "epoch-1-record",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 1,
      previousRecordHash: zeroRecordHash(),
      keyEpoch: 1,
      contentKey: epoch1.contentKey,
      locatorKey,
      signingPrivateKey: signingKeys.privateKey,
      operation: operation("epoch-1-record"),
    });
    const newRecord = createSyncRecord(crypto, {
      recordId: "epoch-2-record",
      vaultId: "vault-1",
      deviceId: "device-a",
      deviceSequence: 2,
      previousRecordHash: hashSignedSyncRecord(crypto, oldRecord),
      keyEpoch: 2,
      contentKey: epoch2.contentKey,
      locatorKey,
      signingPrivateKey: signingKeys.privateKey,
      operation: operation("epoch-2-record"),
    });
    const completeKeyring = new Map([
      [1, epoch1.contentKey],
      [2, epoch2.contentKey],
    ]);
    const revokedDeviceKeyring = new Map([[1, epoch1.contentKey]]);

    expect(
      openSyncRecordWithKeyResolver(crypto, oldRecord, {
        locatorKey,
        signingPublicKey: signingKeys.publicKey,
        resolveContentKey: (epoch) => completeKeyring.get(epoch),
      }).operationId,
    ).toBe("epoch-1-record");
    expect(
      openSyncRecordWithKeyResolver(crypto, newRecord, {
        locatorKey,
        signingPublicKey: signingKeys.publicKey,
        resolveContentKey: (epoch) => completeKeyring.get(epoch),
      }).operationId,
    ).toBe("epoch-2-record");
    expect(() =>
      openSyncRecordWithKeyResolver(crypto, newRecord, {
        locatorKey,
        signingPublicKey: signingKeys.publicKey,
        resolveContentKey: (epoch) => revokedDeviceKeyring.get(epoch),
      }),
    ).toThrow(MissingKeyEpochError);
  });

  it("rejects invalid key lengths, epochs, and encoded sizes", () => {
    expect(() =>
      wrapContentKey(crypto, {
        vaultId: "vault-1",
        keyEpoch: 0,
        vaultRootKey,
        contentKey,
      }),
    ).toThrow(ContentKeyWrapperError);
    expect(() =>
      wrapContentKey(crypto, {
        vaultId: "vault-1",
        keyEpoch: 1,
        vaultRootKey,
        contentKey: new Uint8Array(31),
      }),
    ).toThrow(/Content key/);
    expect(() => decodeContentKeyWrapper(new Uint8Array(1025))).toThrow(
      /wrapper size is invalid/,
    );
  });
});
