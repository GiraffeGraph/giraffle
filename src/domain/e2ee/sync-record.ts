import {
  decodeCanonical,
  encodeCanonical,
  type CanonicalValue,
} from "./canonical-cbor";
import {
  assertHybridLogicalClock,
  type HybridLogicalClock,
} from "./hybrid-logical-clock";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "./crypto-provider";

export const E2EE_PROTOCOL_VERSION = 1 as const;
export const RECORD_HASH_BYTES = 32;
export const OBJECT_LOCATOR_BYTES = 32;
export const MAX_SYNC_CIPHERTEXT_BYTES = 1024 * 1024;
export const MAX_ENCODED_SYNC_RECORD_BYTES = MAX_SYNC_CIPHERTEXT_BYTES + 4096;

export type { HybridLogicalClock } from "./hybrid-logical-clock";

export interface SyncOperationV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  operationId: string;
  objectId: string;
  objectType: string;
  schemaVersion: number;
  clock: HybridLogicalClock;
  mutation: {
    kind: string;
    data: CanonicalValue;
  };
}

export interface EncryptedEnvelopeV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  schemaVersion: number;
  keyEpoch: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

export interface UnsignedSyncRecordV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  recordId: string;
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  previousRecordHash: Uint8Array;
  objectLocator: Uint8Array;
  keyEpoch: number;
  envelope: EncryptedEnvelopeV1;
}

export interface SignedSyncRecordV1 extends UnsignedSyncRecordV1 {
  signature: Uint8Array;
}

export interface CreateSyncRecordInput {
  recordId: string;
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  previousRecordHash: Uint8Array;
  keyEpoch: number;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  operation: SyncOperationV1;
  nonce?: Uint8Array;
}

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}

export class SyncSignatureError extends SyncProtocolError {
  constructor() {
    super("Sync record signature verification failed");
    this.name = "SyncSignatureError";
  }
}

export class MissingKeyEpochError extends SyncProtocolError {
  constructor(readonly keyEpoch: number) {
    super(`Content key epoch ${keyEpoch} is unavailable`);
    this.name = "MissingKeyEpochError";
  }
}

function assertIdentifier(value: unknown, label: string, maxLength = 128) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new SyncProtocolError(`${label} is invalid`);
  }
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new SyncProtocolError(`${label} must be a positive safe integer`);
  }
}

function assertBytes(value: unknown, length: number, label: string) {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new SyncProtocolError(`${label} must be exactly ${length} bytes`);
  }
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw new SyncProtocolError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) {
  const expected = new Set(expectedKeys);
  const actualKeys = Object.keys(value);

  if (
    actualKeys.length !== expected.size ||
    actualKeys.some((key) => !expected.has(key))
  ) {
    throw new SyncProtocolError(`${label} contains unexpected fields`);
  }
}

function unsignedRecord(record: SignedSyncRecordV1): UnsignedSyncRecordV1 {
  return {
    protocolVersion: record.protocolVersion,
    recordId: record.recordId,
    vaultId: record.vaultId,
    deviceId: record.deviceId,
    deviceSequence: record.deviceSequence,
    previousRecordHash: record.previousRecordHash,
    objectLocator: record.objectLocator,
    keyEpoch: record.keyEpoch,
    envelope: record.envelope,
  };
}

function buildAdditionalData(record: UnsignedSyncRecordV1) {
  return encodeCanonical({
    protocolVersion: record.protocolVersion,
    suiteId: record.envelope.suiteId,
    vaultId: record.vaultId,
    recordId: record.recordId,
    objectLocator: record.objectLocator,
    deviceId: record.deviceId,
    deviceSequence: record.deviceSequence,
    schemaVersion: record.envelope.schemaVersion,
    keyEpoch: record.keyEpoch,
  });
}

function operationToCanonical(operation: SyncOperationV1) {
  return {
    protocolVersion: operation.protocolVersion,
    operationId: operation.operationId,
    objectId: operation.objectId,
    objectType: operation.objectType,
    schemaVersion: operation.schemaVersion,
    clock: {
      physicalMs: operation.clock.physicalMs,
      logical: operation.clock.logical,
    },
    mutation: {
      kind: operation.mutation.kind,
      data: operation.mutation.data,
    },
  };
}

export function zeroRecordHash() {
  return new Uint8Array(RECORD_HASH_BYTES);
}

export function createObjectLocator(
  crypto: E2eeCryptoProvider,
  locatorKey: Uint8Array,
  vaultId: string,
  objectId: string,
) {
  assertIdentifier(vaultId, "vaultId");
  assertIdentifier(objectId, "objectId");

  return crypto.keyedHash(
    encodeCanonical([
      "giraffle-object-locator",
      E2EE_PROTOCOL_VERSION,
      vaultId,
      objectId,
    ]),
    locatorKey,
    OBJECT_LOCATOR_BYTES,
  );
}

export function assertSyncOperation(
  value: unknown,
): asserts value is SyncOperationV1 {
  assertPlainObject(value, "operation");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "operationId",
      "objectId",
      "objectType",
      "schemaVersion",
      "clock",
      "mutation",
    ],
    "operation",
  );

  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new SyncProtocolError("Unsupported operation protocol version");
  }

  assertIdentifier(value.operationId, "operationId");
  assertIdentifier(value.objectId, "objectId");
  assertIdentifier(value.objectType, "objectType", 64);
  assertPositiveInteger(value.schemaVersion, "schemaVersion");
  assertPlainObject(value.clock, "clock");
  assertExactKeys(value.clock, ["physicalMs", "logical"], "clock");
  try {
    assertHybridLogicalClock(
      value.clock as unknown as HybridLogicalClock,
      "clock",
    );
  } catch (error) {
    throw new SyncProtocolError(
      error instanceof Error ? error.message : "clock is invalid",
    );
  }
  assertPlainObject(value.mutation, "mutation");
  assertExactKeys(value.mutation, ["kind", "data"], "mutation");
  assertIdentifier(value.mutation.kind, "mutation.kind", 64);

  // Encoding validates that mutation data stays within the canonical subset.
  encodeCanonical(value.mutation.data);
}

export function assertSignedSyncRecord(
  value: unknown,
): asserts value is SignedSyncRecordV1 {
  assertPlainObject(value, "record");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "recordId",
      "vaultId",
      "deviceId",
      "deviceSequence",
      "previousRecordHash",
      "objectLocator",
      "keyEpoch",
      "envelope",
      "signature",
    ],
    "record",
  );

  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new SyncProtocolError("Unsupported sync protocol version");
  }

  assertIdentifier(value.recordId, "recordId");
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.deviceId, "deviceId");
  assertPositiveInteger(value.deviceSequence, "deviceSequence");
  assertBytes(value.previousRecordHash, RECORD_HASH_BYTES, "previousRecordHash");
  assertBytes(value.objectLocator, OBJECT_LOCATOR_BYTES, "objectLocator");
  assertPositiveInteger(value.keyEpoch, "keyEpoch");
  assertBytes(value.signature, 64, "signature");
  assertPlainObject(value.envelope, "envelope");
  assertExactKeys(
    value.envelope,
    [
      "protocolVersion",
      "suiteId",
      "schemaVersion",
      "keyEpoch",
      "nonce",
      "ciphertext",
    ],
    "envelope",
  );

  if (value.envelope.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new SyncProtocolError("Unsupported envelope protocol version");
  }
  if (value.envelope.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new SyncProtocolError("Unsupported crypto suite");
  }

  assertPositiveInteger(value.envelope.schemaVersion, "envelope.schemaVersion");
  assertPositiveInteger(value.envelope.keyEpoch, "envelope.keyEpoch");
  if (value.envelope.keyEpoch !== value.keyEpoch) {
    throw new SyncProtocolError("Envelope key epoch does not match record");
  }
  assertBytes(value.envelope.nonce, 24, "envelope.nonce");

  if (
    !(value.envelope.ciphertext instanceof Uint8Array) ||
    value.envelope.ciphertext.length < 16 ||
    value.envelope.ciphertext.length > MAX_SYNC_CIPHERTEXT_BYTES
  ) {
    throw new SyncProtocolError("Envelope ciphertext size is invalid");
  }
}

export function encodeUnsignedSyncRecord(record: UnsignedSyncRecordV1) {
  return encodeCanonical(record);
}

export function encodeSignedSyncRecord(record: SignedSyncRecordV1) {
  assertSignedSyncRecord(record);
  return encodeCanonical(record);
}

export function decodeSignedSyncRecord(bytes: Uint8Array): SignedSyncRecordV1 {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_SYNC_RECORD_BYTES) {
    throw new SyncProtocolError("Encoded sync record size is invalid");
  }

  const value = decodeCanonical(bytes);
  assertSignedSyncRecord(value);
  return value;
}

export function verifySyncRecord(
  crypto: E2eeCryptoProvider,
  record: SignedSyncRecordV1,
  signingPublicKey: Uint8Array,
) {
  assertSignedSyncRecord(record);

  try {
    if (
      !crypto.verify(
        encodeUnsignedSyncRecord(unsignedRecord(record)),
        record.signature,
        signingPublicKey,
      )
    ) {
      throw new SyncSignatureError();
    }
  } catch (error) {
    if (error instanceof SyncSignatureError) {
      throw error;
    }
    throw new SyncSignatureError();
  }
}

export function createSyncRecord(
  crypto: E2eeCryptoProvider,
  input: CreateSyncRecordInput,
): SignedSyncRecordV1 {
  assertIdentifier(input.recordId, "recordId");
  assertIdentifier(input.vaultId, "vaultId");
  assertIdentifier(input.deviceId, "deviceId");
  assertPositiveInteger(input.deviceSequence, "deviceSequence");
  assertPositiveInteger(input.keyEpoch, "keyEpoch");
  assertBytes(
    input.previousRecordHash,
    RECORD_HASH_BYTES,
    "previousRecordHash",
  );
  assertSyncOperation(input.operation);

  if (input.operation.operationId !== input.recordId) {
    throw new SyncProtocolError("Operation ID must match record ID");
  }

  const objectLocator = createObjectLocator(
    crypto,
    input.locatorKey,
    input.vaultId,
    input.operation.objectId,
  );

  const envelopeBase: EncryptedEnvelopeV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    schemaVersion: input.operation.schemaVersion,
    keyEpoch: input.keyEpoch,
    nonce: input.nonce ?? new Uint8Array(crypto.aeadNonceBytes),
    ciphertext: new Uint8Array(),
  };

  const recordBase: UnsignedSyncRecordV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    recordId: input.recordId,
    vaultId: input.vaultId,
    deviceId: input.deviceId,
    deviceSequence: input.deviceSequence,
    previousRecordHash: input.previousRecordHash.slice(),
    objectLocator,
    keyEpoch: input.keyEpoch,
    envelope: envelopeBase,
  };

  const encrypted = crypto.encrypt({
    plaintext: encodeCanonical(operationToCanonical(input.operation)),
    additionalData: buildAdditionalData(recordBase),
    key: input.contentKey,
    nonce: input.nonce,
  });

  const unsigned: UnsignedSyncRecordV1 = {
    ...recordBase,
    envelope: {
      ...envelopeBase,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
    },
  };

  return {
    ...unsigned,
    signature: crypto.sign(
      encodeUnsignedSyncRecord(unsigned),
      input.signingPrivateKey,
    ),
  };
}

export function openSyncRecord(
  crypto: E2eeCryptoProvider,
  record: SignedSyncRecordV1,
  input: {
    contentKey: Uint8Array;
    locatorKey: Uint8Array;
    signingPublicKey: Uint8Array;
  },
): SyncOperationV1 {
  verifySyncRecord(crypto, record, input.signingPublicKey);

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: record.envelope.ciphertext,
      additionalData: buildAdditionalData(record),
      key: input.contentKey,
      nonce: record.envelope.nonce,
    });
  } catch (error) {
    if (error instanceof CryptoAuthenticationError) {
      throw error;
    }
    throw new CryptoAuthenticationError();
  }

  const operation = decodeCanonical(plaintext);
  assertSyncOperation(operation);

  if (operation.operationId !== record.recordId) {
    throw new SyncProtocolError("Decrypted operation ID does not match record");
  }
  if (operation.schemaVersion !== record.envelope.schemaVersion) {
    throw new SyncProtocolError("Decrypted schema version does not match envelope");
  }

  const expectedLocator = createObjectLocator(
    crypto,
    input.locatorKey,
    record.vaultId,
    operation.objectId,
  );

  if (!bytesEqual(expectedLocator, record.objectLocator)) {
    throw new SyncProtocolError("Object locator does not match decrypted object");
  }

  return operation;
}

export function openSyncRecordWithKeyResolver(
  crypto: E2eeCryptoProvider,
  record: SignedSyncRecordV1,
  input: {
    locatorKey: Uint8Array;
    signingPublicKey: Uint8Array;
    resolveContentKey: (keyEpoch: number) => Uint8Array | undefined;
  },
) {
  const contentKey = input.resolveContentKey(record.keyEpoch);
  if (!contentKey) {
    throw new MissingKeyEpochError(record.keyEpoch);
  }

  return openSyncRecord(crypto, record, {
    contentKey,
    locatorKey: input.locatorKey,
    signingPublicKey: input.signingPublicKey,
  });
}

export function hashSignedSyncRecord(
  crypto: E2eeCryptoProvider,
  record: SignedSyncRecordV1,
) {
  return crypto.hash(encodeSignedSyncRecord(record), RECORD_HASH_BYTES);
}

export function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
