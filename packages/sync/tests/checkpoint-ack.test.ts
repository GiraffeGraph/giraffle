import { createSodiumCryptoProvider } from "@giraffle/protocol/src/sodium-provider";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CheckpointAckError,
  createCheckpointAck,
  decodeCheckpointAck,
  encodeCheckpointAck,
  encodeUnsignedCheckpointAck,
  evaluateCheckpointAcknowledgements,
  evaluateCheckpointCompactionPolicy,
  type SignedCheckpointAckV1,
} from "@giraffle/sync";
import {
  createEncryptedCheckpoint,
  openEncryptedCheckpoint,
  type SignedEncryptedCheckpointV1,
} from "@giraffle/sync";
import {
  type E2eeCryptoProvider,
  type SigningKeyPair,
} from "@giraffle/protocol";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("checkpoint acknowledgements and compaction gate", () => {
  let crypto: E2eeCryptoProvider;
  let deviceA: SigningKeyPair;
  let deviceB: SigningKeyPair;
  let revokedDevice: SigningKeyPair;
  let checkpoint: SignedEncryptedCheckpointV1;
  const contentKey = fixedBytes(32, 0x10);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
    deviceA = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x30));
    deviceB = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x50));
    revokedDevice = crypto.signingKeyPairFromSeed(fixedBytes(32, 0x70));
    checkpoint = createEncryptedCheckpoint(crypto, {
      checkpointId: "checkpoint-1",
      vaultId: "vault-1",
      createdByDeviceId: "device-a",
      keyEpoch: 1,
      coversServerSequence: 100,
      contentKey,
      signingPrivateKey: deviceA.privateKey,
      payload: {
        stateSchemaVersion: 1,
        frontier: [],
        state: { title: "Restored" },
      },
    });
  });

  function ack(
    deviceId: string,
    keys: SigningKeyPair,
  ): SignedCheckpointAckV1 {
    openEncryptedCheckpoint(crypto, checkpoint, {
      contentKey,
      signingPublicKey: deviceA.publicKey,
    });
    return createCheckpointAck(crypto, {
      checkpoint,
      deviceId,
      appliedServerSequence: 100,
      signingPrivateKey: keys.privateKey,
    });
  }

  const devices = () => [
    {
      deviceId: "device-a",
      status: "active" as const,
      signingPublicKey: deviceA.publicKey,
    },
    {
      deviceId: "device-b",
      status: "active" as const,
      signingPublicKey: deviceB.publicKey,
    },
    {
      deviceId: "device-revoked",
      status: "revoked" as const,
      signingPublicKey: revokedDevice.publicKey,
    },
  ];

  it("round-trips a signed acknowledgement", () => {
    const acknowledgement = ack("device-a", deviceA);
    const encoded = encodeCheckpointAck(acknowledgement);

    expect(encodeCheckpointAck(decodeCheckpointAck(encoded))).toEqual(encoded);
  });

  it("blocks compaction while any active device has not acknowledged", () => {
    const result = evaluateCheckpointAcknowledgements(crypto, {
      checkpoint,
      devices: devices(),
      acknowledgements: [ack("device-a", deviceA)],
    });

    expect(result).toEqual({
      allActiveDevicesAcknowledged: false,
      acknowledgedThroughServerSequence: 0,
      missingDeviceIds: ["device-b"],
      invalidDeviceIds: [],
    });
  });

  it("ignores revoked devices but requires every active device", () => {
    const result = evaluateCheckpointAcknowledgements(crypto, {
      checkpoint,
      devices: devices(),
      acknowledgements: [
        ack("device-a", deviceA),
        ack("device-b", deviceB),
      ],
    });

    expect(result.allActiveDevicesAcknowledged).toBe(true);
    expect(result.acknowledgedThroughServerSequence).toBe(100);
  });

  it("blocks forged and stale acknowledgements", () => {
    const forged = ack("device-b", revokedDevice);
    const stale = { ...ack("device-a", deviceA), appliedServerSequence: 99 };
    const { signature: _signature, ...unsigned } = stale;
    stale.signature = crypto.sign(
      encodeUnsignedCheckpointAck(unsigned),
      deviceA.privateKey,
    );

    const result = evaluateCheckpointAcknowledgements(crypto, {
      checkpoint,
      devices: devices(),
      acknowledgements: [stale, forged],
    });

    expect(result.allActiveDevicesAcknowledged).toBe(false);
    expect(result.invalidDeviceIds).toEqual(["device-a", "device-b"]);
  });

  it("requires retention and a verified encrypted-backup restore before deletion", () => {
    const acknowledgements = [ack("device-a", deviceA), ack("device-b", deviceB)];
    const blocked = evaluateCheckpointCompactionPolicy(crypto, {
      checkpoint,
      devices: devices(),
      acknowledgements,
      minimumRetentionElapsed: false,
      encryptedBackupRestoreVerified: true,
    });
    const allowed = evaluateCheckpointCompactionPolicy(crypto, {
      checkpoint,
      devices: devices(),
      acknowledgements,
      minimumRetentionElapsed: true,
      encryptedBackupRestoreVerified: true,
    });

    expect(blocked.canDeleteCoveredRecords).toBe(false);
    expect(blocked.deletableThroughServerSequence).toBe(0);
    expect(allowed.independentlyVerifiedWhenAvailable).toBe(true);
    expect(allowed.canDeleteCoveredRecords).toBe(true);
    expect(allowed.deletableThroughServerSequence).toBe(100);
  });

  it("rejects acknowledgements before the checkpoint cursor is applied", () => {
    expect(() =>
      createCheckpointAck(crypto, {
        checkpoint,
        deviceId: "device-a",
        appliedServerSequence: 99,
        signingPrivateKey: deviceA.privateKey,
      }),
    ).toThrow(CheckpointAckError);
    expect(() => decodeCheckpointAck(new Uint8Array(1025))).toThrow(
      /acknowledgement size is invalid/,
    );
  });
});
