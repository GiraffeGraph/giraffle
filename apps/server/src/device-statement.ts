import {
  bytesEqual,
  decodeCanonical,
  encodeCanonical,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";

export const DEVICE_STATEMENT_VERSION = 1 as const;
export const MAX_ENCODED_DEVICE_STATEMENT_BYTES = 1024;
export const DEVICE_STATEMENT_SKEW_MS = 5 * 60_000;
export const PUBLIC_KEY_BYTES = 32;
export const GRANT_HASH_BYTES = 32;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTIONS = ["approve", "revoke"] as const;

export type DeviceAuthorizationAction = (typeof ACTIONS)[number];

/**
 * The bearer token proves someone may talk to this relay; it does not prove
 * which device is talking. Every change to the trust set therefore travels as
 * this statement, signed by the acting device's Ed25519 identity and verified
 * against the public key the relay already stores for it.
 */
export interface DeviceAuthorizationStatementV1 {
  protocolVersion: 1;
  statementVersion: typeof DEVICE_STATEMENT_VERSION;
  action: DeviceAuthorizationAction;
  vaultId: string;
  actingDeviceId: string;
  subjectDeviceId: string;
  subjectSigningPublicKey: Uint8Array;
  subjectAgreementPublicKey: Uint8Array;
  issuedAtMs: number;
  grantHash: Uint8Array;
}

export class DeviceStatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceStatementError";
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new DeviceStatementError(`${label} is invalid`);
  }
}

function assertBytes(value: unknown, length: number, label: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new DeviceStatementError(`${label} must be exactly ${length} bytes`);
  }
}

export function zeroGrantHash(): Uint8Array {
  return new Uint8Array(GRANT_HASH_BYTES);
}

export function encodeDeviceAuthorizationStatement(
  statement: DeviceAuthorizationStatementV1,
): Uint8Array {
  return encodeCanonical(statement);
}

export function decodeDeviceAuthorizationStatement(
  bytes: Uint8Array,
): DeviceAuthorizationStatementV1 {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_DEVICE_STATEMENT_BYTES) {
    throw new DeviceStatementError("Encoded authorization statement size is invalid");
  }

  const value = decodeCanonical(bytes);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DeviceStatementError("Authorization statement must be an object");
  }

  const expected = [
    "protocolVersion",
    "statementVersion",
    "action",
    "vaultId",
    "actingDeviceId",
    "subjectDeviceId",
    "subjectSigningPublicKey",
    "subjectAgreementPublicKey",
    "issuedAtMs",
    "grantHash",
  ];
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new DeviceStatementError("Authorization statement contains unexpected fields");
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.protocolVersion !== 1) {
    throw new DeviceStatementError("Unsupported protocol version");
  }
  if (candidate.statementVersion !== DEVICE_STATEMENT_VERSION) {
    throw new DeviceStatementError("Unsupported authorization statement version");
  }
  if (
    typeof candidate.action !== "string" ||
    !ACTIONS.includes(candidate.action as DeviceAuthorizationAction)
  ) {
    throw new DeviceStatementError("Unsupported authorization action");
  }

  assertIdentifier(candidate.vaultId, "vaultId");
  assertIdentifier(candidate.actingDeviceId, "actingDeviceId");
  assertIdentifier(candidate.subjectDeviceId, "subjectDeviceId");
  assertBytes(candidate.subjectSigningPublicKey, PUBLIC_KEY_BYTES, "subjectSigningPublicKey");
  assertBytes(candidate.subjectAgreementPublicKey, PUBLIC_KEY_BYTES, "subjectAgreementPublicKey");
  assertBytes(candidate.grantHash, GRANT_HASH_BYTES, "grantHash");

  if (!Number.isSafeInteger(candidate.issuedAtMs) || (candidate.issuedAtMs as number) <= 0) {
    throw new DeviceStatementError("issuedAtMs must be a positive safe integer");
  }

  const statement: DeviceAuthorizationStatementV1 = {
    protocolVersion: 1,
    statementVersion: DEVICE_STATEMENT_VERSION,
    action: candidate.action as DeviceAuthorizationAction,
    vaultId: candidate.vaultId,
    actingDeviceId: candidate.actingDeviceId,
    subjectDeviceId: candidate.subjectDeviceId,
    subjectSigningPublicKey: candidate.subjectSigningPublicKey,
    subjectAgreementPublicKey: candidate.subjectAgreementPublicKey,
    issuedAtMs: candidate.issuedAtMs as number,
    grantHash: candidate.grantHash,
  };

  // Re-encoding proves the bytes are the exact ones the acting device signed,
  // so no field can be reshuffled between signing and verification.
  if (!bytesEqual(encodeDeviceAuthorizationStatement(statement), bytes)) {
    throw new DeviceStatementError("Authorization statement encoding is not canonical");
  }

  return statement;
}

export function verifyDeviceAuthorizationStatement(
  crypto: E2eeCryptoProvider,
  encodedStatement: Uint8Array,
  signature: Uint8Array,
  actingSigningPublicKey: Uint8Array,
) {
  if (signature.length !== 64) {
    throw new DeviceStatementError("Authorization signature must be exactly 64 bytes");
  }

  let valid: boolean;
  try {
    valid = crypto.verify(encodedStatement, signature, actingSigningPublicKey);
  } catch {
    throw new DeviceStatementError("Authorization signature verification failed");
  }
  if (!valid) {
    throw new DeviceStatementError("Authorization signature verification failed");
  }
}

export function hashGrant(crypto: E2eeCryptoProvider, grant: Uint8Array) {
  return crypto.hash(grant, GRANT_HASH_BYTES);
}

export function hashDeviceAuthorizationStatement(
  crypto: E2eeCryptoProvider,
  encodedStatement: Uint8Array,
  signature: Uint8Array,
) {
  return crypto.hash(
    encodeCanonical({ statement: encodedStatement, signature }),
    GRANT_HASH_BYTES,
  );
}
