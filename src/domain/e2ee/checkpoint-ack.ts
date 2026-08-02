import { decodeCanonical, encodeCanonical } from "./canonical-cbor";
import type { E2eeCryptoProvider } from "./crypto-provider";
import {
  CHECKPOINT_VERSION,
  checkpointHash,
  type SignedEncryptedCheckpointV1,
} from "./checkpoint";
import { bytesEqual, E2EE_PROTOCOL_VERSION } from "./sync-record";

export const CHECKPOINT_ACK_VERSION = 1 as const;
export const MAX_ENCODED_CHECKPOINT_ACK_BYTES = 1024;

export interface UnsignedCheckpointAckV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  ackVersion: typeof CHECKPOINT_ACK_VERSION;
  checkpointVersion: typeof CHECKPOINT_VERSION;
  checkpointId: string;
  checkpointHash: Uint8Array;
  vaultId: string;
  deviceId: string;
  appliedServerSequence: number;
}

export interface SignedCheckpointAckV1 extends UnsignedCheckpointAckV1 {
  signature: Uint8Array;
}

export interface CompactionDevice {
  deviceId: string;
  status: "active" | "revoked";
  signingPublicKey: Uint8Array;
}

export interface CheckpointAcknowledgementEvaluation {
  allActiveDevicesAcknowledged: boolean;
  acknowledgedThroughServerSequence: number;
  missingDeviceIds: string[];
  invalidDeviceIds: string[];
}

export interface CheckpointCompactionPolicyEvaluation
  extends CheckpointAcknowledgementEvaluation {
  hasActiveDevice: boolean;
  independentlyVerifiedWhenAvailable: boolean;
  minimumRetentionElapsed: boolean;
  encryptedBackupRestoreVerified: boolean;
  canDeleteCoveredRecords: boolean;
  deletableThroughServerSequence: number;
}

export class CheckpointAckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointAckError";
  }
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw new CheckpointAckError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const expectedSet = new Set(expected);
  const keys = Object.keys(value);
  if (
    keys.length !== expectedSet.size ||
    keys.some((key) => !expectedSet.has(key))
  ) {
    throw new CheckpointAckError(`${label} contains unexpected fields`);
  }
}

function assertIdentifier(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new CheckpointAckError(`${label} is invalid`);
  }
}

function unsignedAck(ack: SignedCheckpointAckV1): UnsignedCheckpointAckV1 {
  return {
    protocolVersion: ack.protocolVersion,
    ackVersion: ack.ackVersion,
    checkpointVersion: ack.checkpointVersion,
    checkpointId: ack.checkpointId,
    checkpointHash: ack.checkpointHash,
    vaultId: ack.vaultId,
    deviceId: ack.deviceId,
    appliedServerSequence: ack.appliedServerSequence,
  };
}

export function assertCheckpointAck(
  value: unknown,
): asserts value is SignedCheckpointAckV1 {
  assertObject(value, "checkpoint acknowledgement");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "ackVersion",
      "checkpointVersion",
      "checkpointId",
      "checkpointHash",
      "vaultId",
      "deviceId",
      "appliedServerSequence",
      "signature",
    ],
    "checkpoint acknowledgement",
  );
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new CheckpointAckError("Unsupported protocol version");
  }
  if (value.ackVersion !== CHECKPOINT_ACK_VERSION) {
    throw new CheckpointAckError("Unsupported checkpoint acknowledgement version");
  }
  if (value.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new CheckpointAckError("Unsupported checkpoint version");
  }
  assertIdentifier(value.checkpointId, "checkpointId");
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.deviceId, "deviceId");
  if (
    !(value.checkpointHash instanceof Uint8Array) ||
    value.checkpointHash.length !== 32
  ) {
    throw new CheckpointAckError("checkpointHash must be exactly 32 bytes");
  }
  if (
    !Number.isSafeInteger(value.appliedServerSequence) ||
    (value.appliedServerSequence as number) < 0
  ) {
    throw new CheckpointAckError(
      "appliedServerSequence must be a non-negative safe integer",
    );
  }
  if (!(value.signature instanceof Uint8Array) || value.signature.length !== 64) {
    throw new CheckpointAckError("signature must be exactly 64 bytes");
  }
}

export function encodeUnsignedCheckpointAck(ack: UnsignedCheckpointAckV1) {
  return encodeCanonical(ack);
}

export function encodeCheckpointAck(ack: SignedCheckpointAckV1) {
  assertCheckpointAck(ack);
  return encodeCanonical(ack);
}

export function decodeCheckpointAck(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_CHECKPOINT_ACK_BYTES) {
    throw new CheckpointAckError(
      "Encoded checkpoint acknowledgement size is invalid",
    );
  }
  const value = decodeCanonical(bytes);
  assertCheckpointAck(value);
  return value;
}

export function createCheckpointAck(
  crypto: E2eeCryptoProvider,
  input: {
    checkpoint: SignedEncryptedCheckpointV1;
    deviceId: string;
    appliedServerSequence: number;
    signingPrivateKey: Uint8Array;
  },
): SignedCheckpointAckV1 {
  assertIdentifier(input.deviceId, "deviceId");
  if (
    !Number.isSafeInteger(input.appliedServerSequence) ||
    input.appliedServerSequence < input.checkpoint.coversServerSequence
  ) {
    throw new CheckpointAckError(
      "Device cursor has not reached the checkpoint coverage",
    );
  }

  const unsigned: UnsignedCheckpointAckV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    ackVersion: CHECKPOINT_ACK_VERSION,
    checkpointVersion: CHECKPOINT_VERSION,
    checkpointId: input.checkpoint.checkpointId,
    checkpointHash: checkpointHash(crypto, input.checkpoint),
    vaultId: input.checkpoint.vaultId,
    deviceId: input.deviceId,
    appliedServerSequence: input.appliedServerSequence,
  };
  return {
    ...unsigned,
    signature: crypto.sign(
      encodeUnsignedCheckpointAck(unsigned),
      input.signingPrivateKey,
    ),
  };
}

export function verifyCheckpointAck(
  crypto: E2eeCryptoProvider,
  ack: SignedCheckpointAckV1,
  signingPublicKey: Uint8Array,
) {
  assertCheckpointAck(ack);
  return crypto.verify(
    encodeUnsignedCheckpointAck(unsignedAck(ack)),
    ack.signature,
    signingPublicKey,
  );
}

/**
 * Evaluates only the active-device acknowledgement prerequisite. Retention and
 * verified-backup gates remain mandatory before deletion. An acknowledgement
 * means the client downloaded, verified, decrypted, restored, and atomically
 * advanced past the checkpoint.
 */
export function evaluateCheckpointAcknowledgements(
  crypto: E2eeCryptoProvider,
  input: {
    checkpoint: SignedEncryptedCheckpointV1;
    devices: CompactionDevice[];
    acknowledgements: SignedCheckpointAckV1[];
  },
): CheckpointAcknowledgementEvaluation {
  const expectedHash = checkpointHash(crypto, input.checkpoint);
  const missingDeviceIds: string[] = [];
  const invalidDeviceIds: string[] = [];
  const activeDevices = input.devices.filter((device) => device.status === "active");

  for (const device of activeDevices) {
    const ack = input.acknowledgements.find(
      (candidate) => candidate.deviceId === device.deviceId,
    );
    if (!ack) {
      missingDeviceIds.push(device.deviceId);
      continue;
    }

    let valid = false;
    try {
      valid =
        ack.checkpointId === input.checkpoint.checkpointId &&
        ack.vaultId === input.checkpoint.vaultId &&
        bytesEqual(ack.checkpointHash, expectedHash) &&
        ack.appliedServerSequence >= input.checkpoint.coversServerSequence &&
        verifyCheckpointAck(crypto, ack, device.signingPublicKey);
    } catch {
      valid = false;
    }
    if (!valid) {
      invalidDeviceIds.push(device.deviceId);
    }
  }

  missingDeviceIds.sort();
  invalidDeviceIds.sort();
  const allActiveDevicesAcknowledged =
    missingDeviceIds.length === 0 && invalidDeviceIds.length === 0;
  return {
    allActiveDevicesAcknowledged,
    acknowledgedThroughServerSequence: allActiveDevicesAcknowledged
      ? input.checkpoint.coversServerSequence
      : 0,
    missingDeviceIds,
    invalidDeviceIds,
  };
}

export function evaluateCheckpointCompactionPolicy(
  crypto: E2eeCryptoProvider,
  input: {
    checkpoint: SignedEncryptedCheckpointV1;
    devices: CompactionDevice[];
    acknowledgements: SignedCheckpointAckV1[];
    minimumRetentionElapsed: boolean;
    encryptedBackupRestoreVerified: boolean;
  },
): CheckpointCompactionPolicyEvaluation {
  const acknowledgement = evaluateCheckpointAcknowledgements(crypto, input);
  const activeDevices = input.devices.filter(
    (device) => device.status === "active",
  );
  const hasActiveDevice = activeDevices.length > 0;
  const otherActiveDeviceIds = new Set(
    activeDevices
      .filter(
        (device) => device.deviceId !== input.checkpoint.createdByDeviceId,
      )
      .map((device) => device.deviceId),
  );
  const independentlyVerifiedWhenAvailable =
    otherActiveDeviceIds.size === 0 ||
    input.acknowledgements.some(
      (ack) =>
        otherActiveDeviceIds.has(ack.deviceId) &&
        !acknowledgement.invalidDeviceIds.includes(ack.deviceId) &&
        !acknowledgement.missingDeviceIds.includes(ack.deviceId),
    );
  const canDeleteCoveredRecords =
    hasActiveDevice &&
    acknowledgement.allActiveDevicesAcknowledged &&
    independentlyVerifiedWhenAvailable &&
    input.minimumRetentionElapsed &&
    input.encryptedBackupRestoreVerified;

  return {
    ...acknowledgement,
    hasActiveDevice,
    independentlyVerifiedWhenAvailable,
    minimumRetentionElapsed: input.minimumRetentionElapsed,
    encryptedBackupRestoreVerified: input.encryptedBackupRestoreVerified,
    canDeleteCoveredRecords,
    deletableThroughServerSequence: canDeleteCoveredRecords
      ? input.checkpoint.coversServerSequence
      : 0,
  };
}
