import { decodeCanonical, encodeCanonical } from "./canonical-cbor";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "./crypto-provider";
import { E2EE_PROTOCOL_VERSION } from "./sync-record";

export const CONTENT_KEY_WRAPPER_VERSION = 1 as const;
export const VAULT_ROOT_KEY_BYTES = 32;
export const CONTENT_KEY_BYTES = 32;
export const MAX_ENCODED_CONTENT_KEY_WRAPPER_BYTES = 1024;

interface ContentKeyWrapperAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  wrapperVersion: typeof CONTENT_KEY_WRAPPER_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  keyEpoch: number;
  nonce: Uint8Array;
}

export interface ContentKeyWrapperV1 extends ContentKeyWrapperAadV1 {
  ciphertext: Uint8Array;
}

export interface NewContentKeyEpochV1 {
  contentKey: Uint8Array;
  wrapper: ContentKeyWrapperV1;
}

export class ContentKeyWrapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentKeyWrapperError";
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
    throw new ContentKeyWrapperError(`${label} must be an object`);
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
    throw new ContentKeyWrapperError(`${label} contains unexpected fields`);
  }
}

function assertVaultId(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ContentKeyWrapperError("vaultId is invalid");
  }
}

function assertKeyEpoch(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ContentKeyWrapperError(
      "keyEpoch must be a positive safe integer",
    );
  }
}

function aadFromWrapper(wrapper: ContentKeyWrapperV1): ContentKeyWrapperAadV1 {
  return {
    protocolVersion: wrapper.protocolVersion,
    wrapperVersion: wrapper.wrapperVersion,
    suiteId: wrapper.suiteId,
    vaultId: wrapper.vaultId,
    keyEpoch: wrapper.keyEpoch,
    nonce: wrapper.nonce,
  };
}

export function assertContentKeyWrapper(
  value: unknown,
): asserts value is ContentKeyWrapperV1 {
  assertObject(value, "content-key wrapper");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "wrapperVersion",
      "suiteId",
      "vaultId",
      "keyEpoch",
      "nonce",
      "ciphertext",
    ],
    "content-key wrapper",
  );

  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new ContentKeyWrapperError("Unsupported protocol version");
  }
  if (value.wrapperVersion !== CONTENT_KEY_WRAPPER_VERSION) {
    throw new ContentKeyWrapperError("Unsupported content-key wrapper version");
  }
  if (value.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new ContentKeyWrapperError("Unsupported content-key wrapper suite");
  }
  assertVaultId(value.vaultId);
  assertKeyEpoch(value.keyEpoch);

  if (!(value.nonce instanceof Uint8Array) || value.nonce.length !== 24) {
    throw new ContentKeyWrapperError("AEAD nonce must be exactly 24 bytes");
  }
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > 512
  ) {
    throw new ContentKeyWrapperError("Wrapped ciphertext size is invalid");
  }
}

export function encodeContentKeyWrapper(wrapper: ContentKeyWrapperV1) {
  assertContentKeyWrapper(wrapper);
  return encodeCanonical(wrapper);
}

export function decodeContentKeyWrapper(bytes: Uint8Array) {
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ENCODED_CONTENT_KEY_WRAPPER_BYTES
  ) {
    throw new ContentKeyWrapperError(
      "Encoded content-key wrapper size is invalid",
    );
  }
  const value = decodeCanonical(bytes);
  assertContentKeyWrapper(value);
  return value;
}

export function wrapContentKey(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    keyEpoch: number;
    vaultRootKey: Uint8Array;
    contentKey: Uint8Array;
  },
): ContentKeyWrapperV1 {
  assertVaultId(input.vaultId);
  assertKeyEpoch(input.keyEpoch);
  if (input.vaultRootKey.length !== VAULT_ROOT_KEY_BYTES) {
    throw new ContentKeyWrapperError("Vault Root Key must be exactly 32 bytes");
  }
  if (input.contentKey.length !== CONTENT_KEY_BYTES) {
    throw new ContentKeyWrapperError("Content key must be exactly 32 bytes");
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const aad: ContentKeyWrapperAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: CONTENT_KEY_WRAPPER_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    keyEpoch: input.keyEpoch,
    nonce,
  };
  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    wrapperVersion: CONTENT_KEY_WRAPPER_VERSION,
    vaultId: input.vaultId,
    keyEpoch: input.keyEpoch,
    contentKey: input.contentKey,
  });

  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(aad),
      key: input.vaultRootKey,
      nonce,
    });
    return { ...aad, ciphertext };
  } finally {
    crypto.clear(plaintext);
  }
}

export function createContentKeyEpoch(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    keyEpoch: number;
    vaultRootKey: Uint8Array;
  },
): NewContentKeyEpochV1 {
  const contentKey = crypto.randomBytes(CONTENT_KEY_BYTES);
  try {
    return {
      contentKey: contentKey.slice(),
      wrapper: wrapContentKey(crypto, { ...input, contentKey }),
    };
  } finally {
    crypto.clear(contentKey);
  }
}

export function unwrapContentKey(
  crypto: E2eeCryptoProvider,
  wrapper: ContentKeyWrapperV1,
  vaultRootKey: Uint8Array,
) {
  assertContentKeyWrapper(wrapper);
  if (vaultRootKey.length !== VAULT_ROOT_KEY_BYTES) {
    throw new ContentKeyWrapperError("Vault Root Key must be exactly 32 bytes");
  }

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: wrapper.ciphertext,
      additionalData: encodeCanonical(aadFromWrapper(wrapper)),
      key: vaultRootKey,
      nonce: wrapper.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertObject(payload, "wrapped payload");
    assertExactKeys(
      payload,
      [
        "protocolVersion",
        "wrapperVersion",
        "vaultId",
        "keyEpoch",
        "contentKey",
      ],
      "wrapped payload",
    );
    if (
      payload.protocolVersion !== E2EE_PROTOCOL_VERSION ||
      payload.wrapperVersion !== CONTENT_KEY_WRAPPER_VERSION ||
      payload.vaultId !== wrapper.vaultId ||
      payload.keyEpoch !== wrapper.keyEpoch
    ) {
      throw new ContentKeyWrapperError(
        "Wrapped payload context does not match content-key wrapper",
      );
    }
    if (
      !(payload.contentKey instanceof Uint8Array) ||
      payload.contentKey.length !== CONTENT_KEY_BYTES
    ) {
      throw new ContentKeyWrapperError("Wrapped content key is invalid");
    }
    return payload.contentKey.slice();
  } finally {
    crypto.clear(plaintext);
  }
}
