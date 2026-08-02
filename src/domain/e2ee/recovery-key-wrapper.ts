import { decodeCanonical, encodeCanonical } from "./canonical-cbor";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "./crypto-provider";
import { bytesEqual, E2EE_PROTOCOL_VERSION } from "./sync-record";

export const RECOVERY_WRAPPER_VERSION = 1 as const;
export const RECOVERY_SECRET_BYTES = 32;
export const RECOVERY_CHECKSUM_BYTES = 5;
export const MAX_ENCODED_RECOVERY_WRAPPER_BYTES = 1024;
const VAULT_ROOT_KEY_BYTES = 32;
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_PREFIX = "GIR1";
const RECOVERY_BODY_CHARACTERS = 52;
const RECOVERY_CHECKSUM_CHARACTERS = 8;
const RECOVERY_DERIVATION_LABEL = "giraffle-recovery-wrap-key-v1";
const RECOVERY_CHECKSUM_LABEL = "giraffle-recovery-checksum-v1";

interface RecoveryWrapperAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  wrapperVersion: typeof RECOVERY_WRAPPER_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  nonce: Uint8Array;
}

export interface RecoveryKeyWrapperV1 extends RecoveryWrapperAadV1 {
  ciphertext: Uint8Array;
}

export interface RecoveryMaterialV1 {
  recoveryCode: string;
  wrapper: RecoveryKeyWrapperV1;
}

export class RecoveryKeyWrapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryKeyWrapperError";
  }
}

function encodeCrockford(bytes: Uint8Array) {
  let output = "";
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return output;
}

function decodeCrockford(value: string) {
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value) {
    const index = CROCKFORD_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new RecoveryKeyWrapperError(
        "Recovery code contains an invalid character",
      );
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }

  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new RecoveryKeyWrapperError("Recovery code has non-zero padding");
  }
  return Uint8Array.from(output);
}

function checksumRecoverySecret(
  crypto: E2eeCryptoProvider,
  secret: Uint8Array,
) {
  const input = new Uint8Array([
    ...new TextEncoder().encode(RECOVERY_CHECKSUM_LABEL),
    ...secret,
  ]);
  return crypto.hash(input, RECOVERY_CHECKSUM_BYTES);
}

export function formatRecoveryCode(
  crypto: E2eeCryptoProvider,
  secret: Uint8Array,
) {
  if (secret.length !== RECOVERY_SECRET_BYTES) {
    throw new RecoveryKeyWrapperError(
      `Recovery secret must be exactly ${RECOVERY_SECRET_BYTES} bytes`,
    );
  }

  const body = encodeCrockford(secret);
  const checksum = encodeCrockford(checksumRecoverySecret(crypto, secret));
  const groups = body.match(/.{1,4}/g);
  if (!groups) {
    throw new RecoveryKeyWrapperError("Could not format recovery code");
  }
  return `${RECOVERY_PREFIX}-${groups.join("-")}-${checksum}`;
}

export function parseRecoveryCode(
  crypto: E2eeCryptoProvider,
  recoveryCode: string,
) {
  if (typeof recoveryCode !== "string") {
    throw new RecoveryKeyWrapperError("Recovery code must be a string");
  }

  const normalized = recoveryCode.trim().toUpperCase();
  if (!normalized.startsWith(`${RECOVERY_PREFIX}-`)) {
    throw new RecoveryKeyWrapperError("Unsupported recovery code version");
  }

  const encoded = normalized.slice(RECOVERY_PREFIX.length + 1).replaceAll("-", "");
  if (
    encoded.length !==
    RECOVERY_BODY_CHARACTERS + RECOVERY_CHECKSUM_CHARACTERS
  ) {
    throw new RecoveryKeyWrapperError("Recovery code length is invalid");
  }

  const secret = decodeCrockford(encoded.slice(0, RECOVERY_BODY_CHARACTERS));
  const checksum = decodeCrockford(encoded.slice(RECOVERY_BODY_CHARACTERS));
  if (secret.length !== RECOVERY_SECRET_BYTES) {
    throw new RecoveryKeyWrapperError("Recovery secret length is invalid");
  }
  if (
    checksum.length !== RECOVERY_CHECKSUM_BYTES ||
    !bytesEqual(checksum, checksumRecoverySecret(crypto, secret))
  ) {
    throw new RecoveryKeyWrapperError("Recovery code checksum is invalid");
  }

  return secret;
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
    throw new RecoveryKeyWrapperError(`${label} must be an object`);
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
    throw new RecoveryKeyWrapperError(`${label} contains unexpected fields`);
  }
}

function assertVaultId(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new RecoveryKeyWrapperError("vaultId is invalid");
  }
}

function aadFromWrapper(wrapper: RecoveryKeyWrapperV1): RecoveryWrapperAadV1 {
  return {
    protocolVersion: wrapper.protocolVersion,
    wrapperVersion: wrapper.wrapperVersion,
    suiteId: wrapper.suiteId,
    vaultId: wrapper.vaultId,
    nonce: wrapper.nonce,
  };
}

export function assertRecoveryKeyWrapper(
  value: unknown,
): asserts value is RecoveryKeyWrapperV1 {
  assertObject(value, "recovery wrapper");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "wrapperVersion",
      "suiteId",
      "vaultId",
      "nonce",
      "ciphertext",
    ],
    "recovery wrapper",
  );
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new RecoveryKeyWrapperError("Unsupported protocol version");
  }
  if (value.wrapperVersion !== RECOVERY_WRAPPER_VERSION) {
    throw new RecoveryKeyWrapperError("Unsupported recovery wrapper version");
  }
  if (value.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new RecoveryKeyWrapperError("Unsupported recovery wrapper suite");
  }
  assertVaultId(value.vaultId);
  if (!(value.nonce instanceof Uint8Array) || value.nonce.length !== 24) {
    throw new RecoveryKeyWrapperError("AEAD nonce must be exactly 24 bytes");
  }
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > 512
  ) {
    throw new RecoveryKeyWrapperError("Wrapped ciphertext size is invalid");
  }
}

function deriveRecoveryWrappingKey(
  crypto: E2eeCryptoProvider,
  recoverySecret: Uint8Array,
  vaultId: string,
) {
  if (recoverySecret.length !== RECOVERY_SECRET_BYTES) {
    throw new RecoveryKeyWrapperError("Recovery secret length is invalid");
  }
  return crypto.keyedHash(
    encodeCanonical({ purpose: RECOVERY_DERIVATION_LABEL, vaultId }),
    recoverySecret,
    crypto.aeadKeyBytes,
  );
}

export function encodeRecoveryKeyWrapper(wrapper: RecoveryKeyWrapperV1) {
  assertRecoveryKeyWrapper(wrapper);
  return encodeCanonical(wrapper);
}

export function decodeRecoveryKeyWrapper(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_RECOVERY_WRAPPER_BYTES) {
    throw new RecoveryKeyWrapperError("Encoded recovery wrapper size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertRecoveryKeyWrapper(value);
  return value;
}

export function createRecoveryKeyWrapper(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    vaultRootKey: Uint8Array;
    recoverySecret: Uint8Array;
  },
): RecoveryKeyWrapperV1 {
  assertVaultId(input.vaultId);
  if (input.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES) {
    throw new RecoveryKeyWrapperError("Vault Root Key must be exactly 32 bytes");
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const aad: RecoveryWrapperAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: RECOVERY_WRAPPER_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    nonce,
  };
  const wrappingKey = deriveRecoveryWrappingKey(
    crypto,
    input.recoverySecret,
    input.vaultId,
  );
  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: RECOVERY_WRAPPER_VERSION,
    vaultId: input.vaultId,
    vaultRootKey: input.vaultRootKey,
  });

  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(aad),
      key: wrappingKey,
      nonce,
    });
    return { ...aad, ciphertext };
  } finally {
    crypto.clear(plaintext);
    crypto.clear(wrappingKey);
  }
}

export function createRecoveryMaterial(
  crypto: E2eeCryptoProvider,
  input: { vaultId: string; vaultRootKey: Uint8Array },
): RecoveryMaterialV1 {
  const recoverySecret = crypto.randomBytes(RECOVERY_SECRET_BYTES);
  try {
    return {
      recoveryCode: formatRecoveryCode(crypto, recoverySecret),
      wrapper: createRecoveryKeyWrapper(crypto, {
        ...input,
        recoverySecret,
      }),
    };
  } finally {
    crypto.clear(recoverySecret);
  }
}

export function openRecoveryKeyWrapper(
  crypto: E2eeCryptoProvider,
  wrapper: RecoveryKeyWrapperV1,
  recoveryCode: string,
) {
  assertRecoveryKeyWrapper(wrapper);
  const recoverySecret = parseRecoveryCode(crypto, recoveryCode);
  let wrappingKey: Uint8Array;
  try {
    wrappingKey = deriveRecoveryWrappingKey(
      crypto,
      recoverySecret,
      wrapper.vaultId,
    );
  } finally {
    crypto.clear(recoverySecret);
  }

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: wrapper.ciphertext,
      additionalData: encodeCanonical(aadFromWrapper(wrapper)),
      key: wrappingKey,
      nonce: wrapper.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  } finally {
    crypto.clear(wrappingKey);
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertObject(payload, "wrapped payload");
    assertExactKeys(
      payload,
      ["protocolVersion", "wrapperVersion", "vaultId", "vaultRootKey"],
      "wrapped payload",
    );
    if (
      payload.protocolVersion !== E2EE_PROTOCOL_VERSION ||
      payload.wrapperVersion !== RECOVERY_WRAPPER_VERSION ||
      payload.vaultId !== wrapper.vaultId
    ) {
      throw new RecoveryKeyWrapperError(
        "Wrapped payload context does not match recovery wrapper",
      );
    }
    if (
      !(payload.vaultRootKey instanceof Uint8Array) ||
      payload.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES
    ) {
      throw new RecoveryKeyWrapperError("Wrapped Vault Root Key is invalid");
    }
    return payload.vaultRootKey.slice();
  } finally {
    crypto.clear(plaintext);
  }
}
