import { decodeCanonical, encodeCanonical } from "./canonical-cbor";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "./crypto-provider";
import { E2EE_PROTOCOL_VERSION } from "./sync-record";

export const PASSPHRASE_WRAPPER_VERSION = 1 as const;
export const ARGON2ID_ALGORITHM = "argon2id13" as const;
export const VAULT_ROOT_KEY_BYTES = 32;
export const PASSPHRASE_DERIVED_KEY_BYTES = 32;
export const DEFAULT_ARGON2ID_OPS_LIMIT = 2;
export const DEFAULT_ARGON2ID_MEMORY_BYTES = 64 * 1024 * 1024;
export const MAX_ARGON2ID_OPS_LIMIT = 10;
export const MAX_ARGON2ID_MEMORY_BYTES = 1024 * 1024 * 1024;
export const MAX_ENCODED_PASSPHRASE_WRAPPER_BYTES = 2048;

interface PassphraseWrapperAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  wrapperVersion: typeof PASSPHRASE_WRAPPER_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  kdfAlgorithm: typeof ARGON2ID_ALGORITHM;
  kdfSalt: Uint8Array;
  kdfOpsLimit: number;
  kdfMemoryBytes: number;
  nonce: Uint8Array;
}

export interface PassphraseKeyWrapperV1 extends PassphraseWrapperAadV1 {
  ciphertext: Uint8Array;
}

export class PassphraseKeyWrapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassphraseKeyWrapperError";
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
    throw new PassphraseKeyWrapperError(`${label} must be an object`);
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
    throw new PassphraseKeyWrapperError(`${label} contains unexpected fields`);
  }
}

function assertSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new PassphraseKeyWrapperError(`${label} is outside the allowed range`);
  }
}

function normalizePassphrase(passphrase: string) {
  if (typeof passphrase !== "string") {
    throw new PassphraseKeyWrapperError("Passphrase must be a string");
  }

  const normalized = passphrase.normalize("NFKC");
  const length = new TextEncoder().encode(normalized).length;
  if (length === 0 || length > 1024) {
    throw new PassphraseKeyWrapperError(
      "Normalized passphrase must contain between 1 and 1024 UTF-8 bytes",
    );
  }
  return normalized;
}

function aadFromWrapper(wrapper: PassphraseKeyWrapperV1): PassphraseWrapperAadV1 {
  return {
    protocolVersion: wrapper.protocolVersion,
    wrapperVersion: wrapper.wrapperVersion,
    suiteId: wrapper.suiteId,
    vaultId: wrapper.vaultId,
    kdfAlgorithm: wrapper.kdfAlgorithm,
    kdfSalt: wrapper.kdfSalt,
    kdfOpsLimit: wrapper.kdfOpsLimit,
    kdfMemoryBytes: wrapper.kdfMemoryBytes,
    nonce: wrapper.nonce,
  };
}

export function assertPassphraseKeyWrapper(
  value: unknown,
): asserts value is PassphraseKeyWrapperV1 {
  assertObject(value, "passphrase wrapper");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "wrapperVersion",
      "suiteId",
      "vaultId",
      "kdfAlgorithm",
      "kdfSalt",
      "kdfOpsLimit",
      "kdfMemoryBytes",
      "nonce",
      "ciphertext",
    ],
    "passphrase wrapper",
  );

  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new PassphraseKeyWrapperError("Unsupported protocol version");
  }
  if (value.wrapperVersion !== PASSPHRASE_WRAPPER_VERSION) {
    throw new PassphraseKeyWrapperError("Unsupported passphrase wrapper version");
  }
  if (value.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new PassphraseKeyWrapperError("Unsupported passphrase wrapper suite");
  }
  if (value.kdfAlgorithm !== ARGON2ID_ALGORITHM) {
    throw new PassphraseKeyWrapperError("Unsupported passphrase KDF");
  }
  if (
    typeof value.vaultId !== "string" ||
    value.vaultId.length === 0 ||
    value.vaultId.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value.vaultId)
  ) {
    throw new PassphraseKeyWrapperError("vaultId is invalid");
  }
  if (!(value.kdfSalt instanceof Uint8Array) || value.kdfSalt.length !== 16) {
    throw new PassphraseKeyWrapperError("Argon2id salt must be exactly 16 bytes");
  }
  assertSafeIntegerInRange(
    value.kdfOpsLimit,
    DEFAULT_ARGON2ID_OPS_LIMIT,
    MAX_ARGON2ID_OPS_LIMIT,
    "Argon2id operations limit",
  );
  assertSafeIntegerInRange(
    value.kdfMemoryBytes,
    DEFAULT_ARGON2ID_MEMORY_BYTES,
    MAX_ARGON2ID_MEMORY_BYTES,
    "Argon2id memory limit",
  );
  if (!(value.nonce instanceof Uint8Array) || value.nonce.length !== 24) {
    throw new PassphraseKeyWrapperError("AEAD nonce must be exactly 24 bytes");
  }
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > 512
  ) {
    throw new PassphraseKeyWrapperError("Wrapped ciphertext size is invalid");
  }
}

export function encodePassphraseKeyWrapper(wrapper: PassphraseKeyWrapperV1) {
  assertPassphraseKeyWrapper(wrapper);
  return encodeCanonical(wrapper);
}

export function decodePassphraseKeyWrapper(bytes: Uint8Array) {
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ENCODED_PASSPHRASE_WRAPPER_BYTES
  ) {
    throw new PassphraseKeyWrapperError(
      "Encoded passphrase wrapper size is invalid",
    );
  }

  const value = decodeCanonical(bytes);
  assertPassphraseKeyWrapper(value);
  return value;
}

export function createPassphraseKeyWrapper(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    vaultRootKey: Uint8Array;
    passphrase: string;
    kdfOpsLimit?: number;
    kdfMemoryBytes?: number;
  },
): PassphraseKeyWrapperV1 {
  if (input.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES) {
    throw new PassphraseKeyWrapperError("Vault Root Key must be exactly 32 bytes");
  }

  const passphrase = normalizePassphrase(input.passphrase);
  const kdfOpsLimit = input.kdfOpsLimit ?? DEFAULT_ARGON2ID_OPS_LIMIT;
  const kdfMemoryBytes =
    input.kdfMemoryBytes ?? DEFAULT_ARGON2ID_MEMORY_BYTES;
  const kdfSalt = crypto.randomBytes(crypto.argon2idSaltBytes);
  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);

  const aad: PassphraseWrapperAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: PASSPHRASE_WRAPPER_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    kdfAlgorithm: ARGON2ID_ALGORITHM,
    kdfSalt,
    kdfOpsLimit,
    kdfMemoryBytes,
    nonce,
  };

  assertPassphraseKeyWrapper({
    ...aad,
    ciphertext: new Uint8Array(17),
  });

  const derivedKey = crypto.deriveArgon2idKey({
    password: passphrase,
    salt: kdfSalt,
    outputLength: PASSPHRASE_DERIVED_KEY_BYTES,
    opsLimit: kdfOpsLimit,
    memLimitBytes: kdfMemoryBytes,
  });

  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: PASSPHRASE_WRAPPER_VERSION,
    vaultId: input.vaultId,
    vaultRootKey: input.vaultRootKey,
  });

  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(aad),
      key: derivedKey,
      nonce,
    });

    return { ...aad, ciphertext };
  } finally {
    crypto.clear(plaintext);
    crypto.clear(derivedKey);
  }
}

export function openPassphraseKeyWrapper(
  crypto: E2eeCryptoProvider,
  wrapper: PassphraseKeyWrapperV1,
  passphraseInput: string,
) {
  assertPassphraseKeyWrapper(wrapper);
  const passphrase = normalizePassphrase(passphraseInput);
  const derivedKey = crypto.deriveArgon2idKey({
    password: passphrase,
    salt: wrapper.kdfSalt,
    outputLength: PASSPHRASE_DERIVED_KEY_BYTES,
    opsLimit: wrapper.kdfOpsLimit,
    memLimitBytes: wrapper.kdfMemoryBytes,
  });

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: wrapper.ciphertext,
      additionalData: encodeCanonical(aadFromWrapper(wrapper)),
      key: derivedKey,
      nonce: wrapper.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  } finally {
    crypto.clear(derivedKey);
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
      payload.wrapperVersion !== PASSPHRASE_WRAPPER_VERSION ||
      payload.vaultId !== wrapper.vaultId
    ) {
      throw new PassphraseKeyWrapperError(
        "Wrapped payload context does not match passphrase wrapper",
      );
    }
    if (
      !(payload.vaultRootKey instanceof Uint8Array) ||
      payload.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES
    ) {
      throw new PassphraseKeyWrapperError("Wrapped Vault Root Key is invalid");
    }

    return payload.vaultRootKey.slice();
  } finally {
    crypto.clear(plaintext);
  }
}
