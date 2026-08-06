import {
  decodeCanonical,
  encodeCanonical,
  type CanonicalValue,
} from "@giraffle/protocol";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";
import { bytesEqual, E2EE_PROTOCOL_VERSION } from "@giraffle/protocol";

export const CHECKPOINT_VERSION = 1 as const;
export const MAX_CHECKPOINT_CIPHERTEXT_BYTES = 16 * 1024 * 1024;
export const MAX_ENCODED_CHECKPOINT_BYTES =
  MAX_CHECKPOINT_CIPHERTEXT_BYTES + 4096;
export const MAX_CHECKPOINT_FRONTIER_DEVICES = 10_000;
const RECORD_HASH_BYTES = 32;

export interface CheckpointFrontierEntryV1 {
  deviceId: string;
  deviceSequence: number;
  recordHash: Uint8Array;
}

export interface CheckpointPayloadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  checkpointVersion: typeof CHECKPOINT_VERSION;
  stateSchemaVersion: number;
  frontier: CheckpointFrontierEntryV1[];
  state: CanonicalValue;
}

export interface UnsignedEncryptedCheckpointV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  checkpointVersion: typeof CHECKPOINT_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  checkpointId: string;
  vaultId: string;
  createdByDeviceId: string;
  keyEpoch: number;
  coversServerSequence: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export interface SignedEncryptedCheckpointV1
  extends UnsignedEncryptedCheckpointV1 {
  signature: Uint8Array;
}

export class CheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointError";
  }
}

export class CheckpointSignatureError extends CheckpointError {
  constructor() {
    super("Checkpoint signature verification failed");
    this.name = "CheckpointSignatureError";
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
    throw new CheckpointError(`${label} must be an object`);
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
    throw new CheckpointError(`${label} contains unexpected fields`);
  }
}

function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new CheckpointError(`${label} is invalid`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CheckpointError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CheckpointError(`${label} must be a positive safe integer`);
  }
}

function unsignedCheckpoint(
  checkpoint: SignedEncryptedCheckpointV1,
): UnsignedEncryptedCheckpointV1 {
  return {
    protocolVersion: checkpoint.protocolVersion,
    checkpointVersion: checkpoint.checkpointVersion,
    suiteId: checkpoint.suiteId,
    checkpointId: checkpoint.checkpointId,
    vaultId: checkpoint.vaultId,
    createdByDeviceId: checkpoint.createdByDeviceId,
    keyEpoch: checkpoint.keyEpoch,
    coversServerSequence: checkpoint.coversServerSequence,
    nonce: checkpoint.nonce,
    ciphertext: checkpoint.ciphertext,
  };
}

function checkpointAad(
  checkpoint: Omit<UnsignedEncryptedCheckpointV1, "ciphertext">,
) {
  return encodeCanonical(checkpoint);
}

export function assertEncryptedCheckpoint(
  value: unknown,
): asserts value is SignedEncryptedCheckpointV1 {
  assertObject(value, "checkpoint");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "checkpointVersion",
      "suiteId",
      "checkpointId",
      "vaultId",
      "createdByDeviceId",
      "keyEpoch",
      "coversServerSequence",
      "nonce",
      "ciphertext",
      "signature",
    ],
    "checkpoint",
  );
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new CheckpointError("Unsupported protocol version");
  }
  if (value.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new CheckpointError("Unsupported checkpoint version");
  }
  if (value.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new CheckpointError("Unsupported checkpoint suite");
  }
  assertIdentifier(value.checkpointId, "checkpointId");
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.createdByDeviceId, "createdByDeviceId");
  assertPositiveInteger(value.keyEpoch, "keyEpoch");
  assertNonNegativeInteger(value.coversServerSequence, "coversServerSequence");
  if (!(value.nonce instanceof Uint8Array) || value.nonce.length !== 24) {
    throw new CheckpointError("Checkpoint nonce must be exactly 24 bytes");
  }
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > MAX_CHECKPOINT_CIPHERTEXT_BYTES
  ) {
    throw new CheckpointError("Checkpoint ciphertext size is invalid");
  }
  if (!(value.signature instanceof Uint8Array) || value.signature.length !== 64) {
    throw new CheckpointError("Checkpoint signature must be exactly 64 bytes");
  }
}

export function assertCheckpointPayload(
  value: unknown,
): asserts value is CheckpointPayloadV1 {
  assertObject(value, "checkpoint payload");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "checkpointVersion",
      "stateSchemaVersion",
      "frontier",
      "state",
    ],
    "checkpoint payload",
  );
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new CheckpointError("Unsupported checkpoint payload protocol version");
  }
  if (value.checkpointVersion !== CHECKPOINT_VERSION) {
    throw new CheckpointError("Unsupported checkpoint payload version");
  }
  assertPositiveInteger(value.stateSchemaVersion, "stateSchemaVersion");
  if (
    !Array.isArray(value.frontier) ||
    value.frontier.length > MAX_CHECKPOINT_FRONTIER_DEVICES
  ) {
    throw new CheckpointError("Checkpoint frontier size is invalid");
  }

  try {
    encodeCanonical(value.state);
  } catch {
    throw new CheckpointError("Checkpoint state is not canonical");
  }

  const seenDevices = new Set<string>();
  for (const [index, entry] of value.frontier.entries()) {
    assertObject(entry, `frontier[${index}]`);
    assertExactKeys(
      entry,
      ["deviceId", "deviceSequence", "recordHash"],
      `frontier[${index}]`,
    );
    assertIdentifier(entry.deviceId, `frontier[${index}].deviceId`);
    if (seenDevices.has(entry.deviceId)) {
      throw new CheckpointError("Checkpoint frontier contains duplicate devices");
    }
    seenDevices.add(entry.deviceId);
    assertNonNegativeInteger(
      entry.deviceSequence,
      `frontier[${index}].deviceSequence`,
    );
    if (
      !(entry.recordHash instanceof Uint8Array) ||
      entry.recordHash.length !== RECORD_HASH_BYTES
    ) {
      throw new CheckpointError(
        `frontier[${index}].recordHash must be exactly 32 bytes`,
      );
    }
  }
}

export function encodeUnsignedCheckpoint(
  checkpoint: UnsignedEncryptedCheckpointV1,
) {
  return encodeCanonical(checkpoint);
}

export function encodeEncryptedCheckpoint(
  checkpoint: SignedEncryptedCheckpointV1,
) {
  assertEncryptedCheckpoint(checkpoint);
  return encodeCanonical(checkpoint);
}

export function decodeEncryptedCheckpoint(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_CHECKPOINT_BYTES) {
    throw new CheckpointError("Encoded checkpoint size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertEncryptedCheckpoint(value);
  return value;
}

export function createEncryptedCheckpoint(
  crypto: E2eeCryptoProvider,
  input: {
    checkpointId: string;
    vaultId: string;
    createdByDeviceId: string;
    keyEpoch: number;
    coversServerSequence: number;
    contentKey: Uint8Array;
    signingPrivateKey: Uint8Array;
    payload: Omit<
      CheckpointPayloadV1,
      "protocolVersion" | "checkpointVersion"
    >;
  },
): SignedEncryptedCheckpointV1 {
  assertIdentifier(input.checkpointId, "checkpointId");
  assertIdentifier(input.vaultId, "vaultId");
  assertIdentifier(input.createdByDeviceId, "createdByDeviceId");
  assertPositiveInteger(input.keyEpoch, "keyEpoch");
  assertNonNegativeInteger(input.coversServerSequence, "coversServerSequence");
  if (input.contentKey.length !== crypto.aeadKeyBytes) {
    throw new CheckpointError(
      `Content key must be exactly ${crypto.aeadKeyBytes} bytes`,
    );
  }

  const payload: CheckpointPayloadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    checkpointVersion: CHECKPOINT_VERSION,
    ...input.payload,
  };
  assertCheckpointPayload(payload);
  const plaintext = encodeCanonical(payload);
  if (plaintext.length + 16 > MAX_CHECKPOINT_CIPHERTEXT_BYTES) {
    crypto.clear(plaintext);
    throw new CheckpointError("Checkpoint plaintext is too large");
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const header = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    checkpointVersion: CHECKPOINT_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    checkpointId: input.checkpointId,
    vaultId: input.vaultId,
    createdByDeviceId: input.createdByDeviceId,
    keyEpoch: input.keyEpoch,
    coversServerSequence: input.coversServerSequence,
    nonce,
  } as const;

  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: checkpointAad(header),
      key: input.contentKey,
      nonce,
    });
    const unsigned: UnsignedEncryptedCheckpointV1 = {
      ...header,
      ciphertext,
    };
    return {
      ...unsigned,
      signature: crypto.sign(
        encodeUnsignedCheckpoint(unsigned),
        input.signingPrivateKey,
      ),
    };
  } finally {
    crypto.clear(plaintext);
  }
}

export function verifyEncryptedCheckpoint(
  crypto: E2eeCryptoProvider,
  checkpoint: SignedEncryptedCheckpointV1,
  signingPublicKey: Uint8Array,
) {
  assertEncryptedCheckpoint(checkpoint);
  if (
    !crypto.verify(
      encodeUnsignedCheckpoint(unsignedCheckpoint(checkpoint)),
      checkpoint.signature,
      signingPublicKey,
    )
  ) {
    throw new CheckpointSignatureError();
  }
}

export function openEncryptedCheckpoint(
  crypto: E2eeCryptoProvider,
  checkpoint: SignedEncryptedCheckpointV1,
  input: { contentKey: Uint8Array; signingPublicKey: Uint8Array },
) {
  verifyEncryptedCheckpoint(crypto, checkpoint, input.signingPublicKey);

  let plaintext: Uint8Array;
  try {
    const { ciphertext: _ciphertext, ...header } = unsignedCheckpoint(checkpoint);
    plaintext = crypto.decrypt({
      ciphertext: checkpoint.ciphertext,
      additionalData: checkpointAad(header),
      key: input.contentKey,
      nonce: checkpoint.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertCheckpointPayload(payload);
    return payload;
  } finally {
    crypto.clear(plaintext);
  }
}

export function checkpointHash(
  crypto: E2eeCryptoProvider,
  checkpoint: SignedEncryptedCheckpointV1,
) {
  assertEncryptedCheckpoint(checkpoint);
  return crypto.hash(encodeEncryptedCheckpoint(checkpoint), 32);
}

export function checkpointFrontierMatchesHead(
  payload: CheckpointPayloadV1,
  deviceId: string,
  deviceSequence: number,
  recordHash: Uint8Array,
) {
  assertCheckpointPayload(payload);
  const entry = payload.frontier.find((item) => item.deviceId === deviceId);
  return Boolean(
    entry &&
      entry.deviceSequence === deviceSequence &&
      bytesEqual(entry.recordHash, recordHash),
  );
}
