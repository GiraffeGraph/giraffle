import { beforeAll, describe, expect, it } from "vitest";
import {
  CheckpointError,
  CheckpointSignatureError,
  checkpointFrontierMatchesHead,
  checkpointHash,
  createEncryptedCheckpoint,
  decodeEncryptedCheckpoint,
  encodeEncryptedCheckpoint,
  encodeUnsignedCheckpoint,
  openEncryptedCheckpoint,
  type SignedEncryptedCheckpointV1,
  type UnsignedEncryptedCheckpointV1,
} from "@/domain/e2ee/checkpoint";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@/domain/e2ee/crypto-provider";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("encrypted checkpoints", () => {
  let crypto: E2eeCryptoProvider;
  let device: SigningKeyPair;
  let otherDevice: SigningKeyPair;
  const contentKey = fixedBytes(32, 0x10);
  const deviceHead = fixedBytes(32, 0x80);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    device = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x30));
    otherDevice = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x50));
  });

  function createCheckpoint() {
    return createEncryptedCheckpoint(crypto, {
      checkpointId: "checkpoint-1",
      vaultId: "vault-1",
      createdByDeviceId: "device-a",
      keyEpoch: 2,
      coversServerSequence: 42,
      contentKey,
      signingPrivateKey: device.privateKey,
      payload: {
        stateSchemaVersion: 1,
        frontier: [
          {
            deviceId: "device-a",
            deviceSequence: 7,
            recordHash: deviceHead,
          },
        ],
        state: {
          notes: [
            {
              id: "note-1",
              title: "Offline state",
              deleted: false,
            },
          ],
        },
      },
    });
  }

  it("signs, serializes, opens, and restores canonical materialized state", () => {
    const checkpoint = createCheckpoint();
    const encoded = encodeEncryptedCheckpoint(checkpoint);
    const decoded = decodeEncryptedCheckpoint(encoded);
    const payload = openEncryptedCheckpoint(crypto, decoded, {
      contentKey,
      signingPublicKey: device.publicKey,
    });

    expect(encodeEncryptedCheckpoint(decoded)).toEqual(encoded);
    expect(payload.state).toEqual({
      notes: [{ id: "note-1", title: "Offline state", deleted: false }],
    });
    expect(
      checkpointFrontierMatchesHead(payload, "device-a", 7, deviceHead),
    ).toBe(true);
    expect(
      checkpointFrontierMatchesHead(payload, "device-a", 6, deviceHead),
    ).toBe(false);
    expect(checkpointHash(crypto, checkpoint)).toHaveLength(32);
  });

  it("rejects ciphertext corruption at the signature boundary", () => {
    const checkpoint = structuredClone(createCheckpoint());
    checkpoint.ciphertext[checkpoint.ciphertext.length - 1] ^= 1;

    expect(() =>
      openEncryptedCheckpoint(crypto, checkpoint, {
        contentKey,
        signingPublicKey: device.publicKey,
      }),
    ).toThrow(CheckpointSignatureError);
  });

  it("rejects authenticated header substitution through AEAD", () => {
    const checkpoint: SignedEncryptedCheckpointV1 = {
      ...structuredClone(createCheckpoint()),
      coversServerSequence: 43,
    };
    const { signature: _signature, ...unsigned } = checkpoint;
    checkpoint.signature = crypto.sign(
      encodeUnsignedCheckpoint(unsigned as UnsignedEncryptedCheckpointV1),
      device.privateKey,
    );

    expect(() =>
      openEncryptedCheckpoint(crypto, checkpoint, {
        contentKey,
        signingPublicKey: device.publicKey,
      }),
    ).toThrow(CryptoAuthenticationError);
  });

  it("rejects an untrusted checkpoint signer", () => {
    expect(() =>
      openEncryptedCheckpoint(crypto, createCheckpoint(), {
        contentKey,
        signingPublicKey: otherDevice.publicKey,
      }),
    ).toThrow(CheckpointSignatureError);
  });

  it("rejects duplicate frontier devices and invalid encoded sizes", () => {
    expect(() =>
      createEncryptedCheckpoint(crypto, {
        checkpointId: "checkpoint-invalid",
        vaultId: "vault-1",
        createdByDeviceId: "device-a",
        keyEpoch: 1,
        coversServerSequence: 1,
        contentKey,
        signingPrivateKey: device.privateKey,
        payload: {
          stateSchemaVersion: 1,
          frontier: [
            {
              deviceId: "device-a",
              deviceSequence: 1,
              recordHash: deviceHead,
            },
            {
              deviceId: "device-a",
              deviceSequence: 2,
              recordHash: fixedBytes(32, 0xa0),
            },
          ],
          state: {},
        },
      }),
    ).toThrow(/duplicate devices/);

    expect(() => decodeEncryptedCheckpoint(new Uint8Array(16_781_313))).toThrow(
      CheckpointError,
    );
  });
});
