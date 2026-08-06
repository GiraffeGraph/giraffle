import { decodeCanonical, encodeCanonical } from "@giraffle/protocol";
import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";
import { bytesEqual, E2EE_PROTOCOL_VERSION } from "@giraffle/protocol";

export const BLOB_FORMAT_VERSION = 1 as const;
export const BLOB_DATA_KEY_BYTES = 32;
export const MAX_BLOB_CHUNK_PLAINTEXT_BYTES = 1024 * 1024;
export const MAX_BLOB_CHUNKS = 100_000;
export const MAX_ENCODED_BLOB_KEY_WRAPPER_BYTES = 1024;
export const MAX_ENCODED_BLOB_CHUNK_BYTES =
  MAX_BLOB_CHUNK_PLAINTEXT_BYTES + 4096;

interface BlobKeyWrapperAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  blobVersion: typeof BLOB_FORMAT_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  blobId: string;
  keyEpoch: number;
  nonce: Uint8Array;
}

export interface BlobKeyWrapperV1 extends BlobKeyWrapperAadV1 {
  ciphertext: Uint8Array;
}

interface BlobChunkAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  blobVersion: typeof BLOB_FORMAT_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  blobId: string;
  keyEpoch: number;
  chunkIndex: number;
  totalChunks: number;
  plaintextBytes: number;
  nonce: Uint8Array;
}

export interface EncryptedBlobChunkV1 extends BlobChunkAadV1 {
  ciphertext: Uint8Array;
}

export interface NewBlobDataKeyV1 {
  blobDataKey: Uint8Array;
  wrapper: BlobKeyWrapperV1;
}

export class BlobCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobCryptoError";
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
    throw new BlobCryptoError(`${label} must be an object`);
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
    throw new BlobCryptoError(`${label} contains unexpected fields`);
  }
}

function assertIdentifier(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new BlobCryptoError(`${label} is invalid`);
  }
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BlobCryptoError(`${label} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BlobCryptoError(`${label} must be a non-negative safe integer`);
  }
}

function assertBaseHeader(value: Record<string, unknown>) {
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new BlobCryptoError("Unsupported protocol version");
  }
  if (value.blobVersion !== BLOB_FORMAT_VERSION) {
    throw new BlobCryptoError("Unsupported blob format version");
  }
  if (value.suiteId !== E2EE_CRYPTO_SUITE) {
    throw new BlobCryptoError("Unsupported blob crypto suite");
  }
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.blobId, "blobId");
  assertPositiveInteger(value.keyEpoch, "keyEpoch");
  if (!(value.nonce instanceof Uint8Array) || value.nonce.length !== 24) {
    throw new BlobCryptoError("Blob nonce must be exactly 24 bytes");
  }
}

function keyWrapperAad(wrapper: BlobKeyWrapperV1): BlobKeyWrapperAadV1 {
  return {
    protocolVersion: wrapper.protocolVersion,
    blobVersion: wrapper.blobVersion,
    suiteId: wrapper.suiteId,
    vaultId: wrapper.vaultId,
    blobId: wrapper.blobId,
    keyEpoch: wrapper.keyEpoch,
    nonce: wrapper.nonce,
  };
}

function chunkAad(chunk: EncryptedBlobChunkV1): BlobChunkAadV1 {
  return {
    protocolVersion: chunk.protocolVersion,
    blobVersion: chunk.blobVersion,
    suiteId: chunk.suiteId,
    vaultId: chunk.vaultId,
    blobId: chunk.blobId,
    keyEpoch: chunk.keyEpoch,
    chunkIndex: chunk.chunkIndex,
    totalChunks: chunk.totalChunks,
    plaintextBytes: chunk.plaintextBytes,
    nonce: chunk.nonce,
  };
}

export function assertBlobKeyWrapper(
  value: unknown,
): asserts value is BlobKeyWrapperV1 {
  assertObject(value, "blob key wrapper");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "blobVersion",
      "suiteId",
      "vaultId",
      "blobId",
      "keyEpoch",
      "nonce",
      "ciphertext",
    ],
    "blob key wrapper",
  );
  assertBaseHeader(value);
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > 512
  ) {
    throw new BlobCryptoError("Wrapped blob key ciphertext size is invalid");
  }
}

export function assertEncryptedBlobChunk(
  value: unknown,
): asserts value is EncryptedBlobChunkV1 {
  assertObject(value, "blob chunk");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "blobVersion",
      "suiteId",
      "vaultId",
      "blobId",
      "keyEpoch",
      "chunkIndex",
      "totalChunks",
      "plaintextBytes",
      "nonce",
      "ciphertext",
    ],
    "blob chunk",
  );
  assertBaseHeader(value);
  assertPositiveInteger(value.totalChunks, "totalChunks");
  if ((value.totalChunks as number) > MAX_BLOB_CHUNKS) {
    throw new BlobCryptoError("totalChunks exceeds the protocol limit");
  }
  assertNonNegativeInteger(value.chunkIndex, "chunkIndex");
  if ((value.chunkIndex as number) >= (value.totalChunks as number)) {
    throw new BlobCryptoError("chunkIndex must be smaller than totalChunks");
  }
  assertNonNegativeInteger(value.plaintextBytes, "plaintextBytes");
  if ((value.plaintextBytes as number) > MAX_BLOB_CHUNK_PLAINTEXT_BYTES) {
    throw new BlobCryptoError("Blob chunk plaintext exceeds the protocol limit");
  }
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length !== (value.plaintextBytes as number) + 16
  ) {
    throw new BlobCryptoError("Blob chunk ciphertext length is invalid");
  }
}

export function encodeBlobKeyWrapper(wrapper: BlobKeyWrapperV1) {
  assertBlobKeyWrapper(wrapper);
  return encodeCanonical(wrapper);
}

export function decodeBlobKeyWrapper(bytes: Uint8Array) {
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ENCODED_BLOB_KEY_WRAPPER_BYTES
  ) {
    throw new BlobCryptoError("Encoded blob key wrapper size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertBlobKeyWrapper(value);
  return value;
}

export function encodeEncryptedBlobChunk(chunk: EncryptedBlobChunkV1) {
  assertEncryptedBlobChunk(chunk);
  return encodeCanonical(chunk);
}

export function decodeEncryptedBlobChunk(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_BLOB_CHUNK_BYTES) {
    throw new BlobCryptoError("Encoded blob chunk size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertEncryptedBlobChunk(value);
  return value;
}

export function wrapBlobDataKey(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    blobId: string;
    keyEpoch: number;
    contentKey: Uint8Array;
    blobDataKey: Uint8Array;
  },
): BlobKeyWrapperV1 {
  assertIdentifier(input.vaultId, "vaultId");
  assertIdentifier(input.blobId, "blobId");
  assertPositiveInteger(input.keyEpoch, "keyEpoch");
  if (input.contentKey.length !== crypto.aeadKeyBytes) {
    throw new BlobCryptoError(
      `Content key must be exactly ${crypto.aeadKeyBytes} bytes`,
    );
  }
  if (input.blobDataKey.length !== BLOB_DATA_KEY_BYTES) {
    throw new BlobCryptoError(
      `Blob data key must be exactly ${BLOB_DATA_KEY_BYTES} bytes`,
    );
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const aad: BlobKeyWrapperAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    blobVersion: BLOB_FORMAT_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    blobId: input.blobId,
    keyEpoch: input.keyEpoch,
    nonce,
  };
  const plaintext = encodeCanonical({
    protocolVersion: E2EE_PROTOCOL_VERSION,
    blobVersion: BLOB_FORMAT_VERSION,
    vaultId: input.vaultId,
    blobId: input.blobId,
    keyEpoch: input.keyEpoch,
    blobDataKey: input.blobDataKey,
  });

  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(aad),
      key: input.contentKey,
      nonce,
    });
    return { ...aad, ciphertext };
  } finally {
    crypto.clear(plaintext);
  }
}

export function createBlobDataKey(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    blobId: string;
    keyEpoch: number;
    contentKey: Uint8Array;
  },
): NewBlobDataKeyV1 {
  const blobDataKey = crypto.randomBytes(BLOB_DATA_KEY_BYTES);
  try {
    return {
      blobDataKey: blobDataKey.slice(),
      wrapper: wrapBlobDataKey(crypto, { ...input, blobDataKey }),
    };
  } finally {
    crypto.clear(blobDataKey);
  }
}

export function unwrapBlobDataKey(
  crypto: E2eeCryptoProvider,
  wrapper: BlobKeyWrapperV1,
  contentKey: Uint8Array,
) {
  assertBlobKeyWrapper(wrapper);
  if (contentKey.length !== crypto.aeadKeyBytes) {
    throw new BlobCryptoError(
      `Content key must be exactly ${crypto.aeadKeyBytes} bytes`,
    );
  }

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: wrapper.ciphertext,
      additionalData: encodeCanonical(keyWrapperAad(wrapper)),
      key: contentKey,
      nonce: wrapper.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertObject(payload, "wrapped blob key payload");
    assertExactKeys(
      payload,
      [
        "protocolVersion",
        "blobVersion",
        "vaultId",
        "blobId",
        "keyEpoch",
        "blobDataKey",
      ],
      "wrapped blob key payload",
    );
    if (
      payload.protocolVersion !== E2EE_PROTOCOL_VERSION ||
      payload.blobVersion !== BLOB_FORMAT_VERSION ||
      payload.vaultId !== wrapper.vaultId ||
      payload.blobId !== wrapper.blobId ||
      payload.keyEpoch !== wrapper.keyEpoch
    ) {
      throw new BlobCryptoError(
        "Wrapped blob key context does not match its wrapper",
      );
    }
    if (
      !(payload.blobDataKey instanceof Uint8Array) ||
      payload.blobDataKey.length !== BLOB_DATA_KEY_BYTES
    ) {
      throw new BlobCryptoError("Wrapped blob data key is invalid");
    }
    return payload.blobDataKey.slice();
  } finally {
    crypto.clear(plaintext);
  }
}

export function encryptBlobChunk(
  crypto: E2eeCryptoProvider,
  input: {
    vaultId: string;
    blobId: string;
    keyEpoch: number;
    chunkIndex: number;
    totalChunks: number;
    plaintext: Uint8Array;
    blobDataKey: Uint8Array;
  },
): EncryptedBlobChunkV1 {
  if (input.blobDataKey.length !== BLOB_DATA_KEY_BYTES) {
    throw new BlobCryptoError(
      `Blob data key must be exactly ${BLOB_DATA_KEY_BYTES} bytes`,
    );
  }
  if (input.plaintext.length > MAX_BLOB_CHUNK_PLAINTEXT_BYTES) {
    throw new BlobCryptoError("Blob chunk plaintext exceeds the protocol limit");
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const aad: BlobChunkAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    blobVersion: BLOB_FORMAT_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: input.vaultId,
    blobId: input.blobId,
    keyEpoch: input.keyEpoch,
    chunkIndex: input.chunkIndex,
    totalChunks: input.totalChunks,
    plaintextBytes: input.plaintext.length,
    nonce,
  };
  assertEncryptedBlobChunk({
    ...aad,
    ciphertext: new Uint8Array(input.plaintext.length + 16),
  });

  const { ciphertext } = crypto.encrypt({
    plaintext: input.plaintext,
    additionalData: encodeCanonical(aad),
    key: input.blobDataKey,
    nonce,
  });
  return { ...aad, ciphertext };
}

export function decryptBlobChunk(
  crypto: E2eeCryptoProvider,
  chunk: EncryptedBlobChunkV1,
  blobDataKey: Uint8Array,
) {
  assertEncryptedBlobChunk(chunk);
  if (blobDataKey.length !== BLOB_DATA_KEY_BYTES) {
    throw new BlobCryptoError(
      `Blob data key must be exactly ${BLOB_DATA_KEY_BYTES} bytes`,
    );
  }

  try {
    const plaintext = crypto.decrypt({
      ciphertext: chunk.ciphertext,
      additionalData: encodeCanonical(chunkAad(chunk)),
      key: blobDataKey,
      nonce: chunk.nonce,
    });
    if (plaintext.length !== chunk.plaintextBytes) {
      crypto.clear(plaintext);
      throw new CryptoAuthenticationError();
    }
    return plaintext;
  } catch {
    throw new CryptoAuthenticationError();
  }
}

export function encryptedBlobChunkHash(
  crypto: E2eeCryptoProvider,
  chunk: EncryptedBlobChunkV1,
) {
  return crypto.hash(encodeEncryptedBlobChunk(chunk), 32);
}

export interface BlobManifestPayloadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  blobVersion: typeof BLOB_FORMAT_VERSION;
  vaultId: string;
  blobId: string;
  keyEpoch: number;
  fileName: string;
  mediaType: string;
  totalChunks: number;
  totalPlaintextBytes: number;
  plaintextHash: Uint8Array;
  encryptedChunkHashes: Uint8Array[];
}

interface BlobManifestAadV1 {
  protocolVersion: typeof E2EE_PROTOCOL_VERSION;
  blobVersion: typeof BLOB_FORMAT_VERSION;
  suiteId: typeof E2EE_CRYPTO_SUITE;
  vaultId: string;
  blobId: string;
  keyEpoch: number;
  totalChunks: number;
  totalPlaintextBytes: number;
  nonce: Uint8Array;
}

export interface EncryptedBlobManifestV1 extends BlobManifestAadV1 {
  ciphertext: Uint8Array;
}

export const MAX_BLOB_MANIFEST_CIPHERTEXT_BYTES = 8 * 1024 * 1024;
export const MAX_ENCODED_BLOB_MANIFEST_BYTES =
  MAX_BLOB_MANIFEST_CIPHERTEXT_BYTES + 4096;

function manifestAad(
  manifest: EncryptedBlobManifestV1,
): BlobManifestAadV1 {
  return {
    protocolVersion: manifest.protocolVersion,
    blobVersion: manifest.blobVersion,
    suiteId: manifest.suiteId,
    vaultId: manifest.vaultId,
    blobId: manifest.blobId,
    keyEpoch: manifest.keyEpoch,
    totalChunks: manifest.totalChunks,
    totalPlaintextBytes: manifest.totalPlaintextBytes,
    nonce: manifest.nonce,
  };
}

export function assertBlobManifestPayload(
  value: unknown,
): asserts value is BlobManifestPayloadV1 {
  assertObject(value, "blob manifest payload");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "blobVersion",
      "vaultId",
      "blobId",
      "keyEpoch",
      "fileName",
      "mediaType",
      "totalChunks",
      "totalPlaintextBytes",
      "plaintextHash",
      "encryptedChunkHashes",
    ],
    "blob manifest payload",
  );
  if (value.protocolVersion !== E2EE_PROTOCOL_VERSION) {
    throw new BlobCryptoError("Unsupported manifest protocol version");
  }
  if (value.blobVersion !== BLOB_FORMAT_VERSION) {
    throw new BlobCryptoError("Unsupported manifest blob version");
  }
  assertIdentifier(value.vaultId, "vaultId");
  assertIdentifier(value.blobId, "blobId");
  assertPositiveInteger(value.keyEpoch, "keyEpoch");
  if (
    typeof value.fileName !== "string" ||
    value.fileName.length === 0 ||
    new TextEncoder().encode(value.fileName).length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(value.fileName)
  ) {
    throw new BlobCryptoError("Manifest fileName is invalid");
  }
  if (
    typeof value.mediaType !== "string" ||
    value.mediaType.length === 0 ||
    value.mediaType.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(value.mediaType)
  ) {
    throw new BlobCryptoError("Manifest mediaType is invalid");
  }
  assertPositiveInteger(value.totalChunks, "totalChunks");
  if ((value.totalChunks as number) > MAX_BLOB_CHUNKS) {
    throw new BlobCryptoError("Manifest totalChunks exceeds the protocol limit");
  }
  assertNonNegativeInteger(value.totalPlaintextBytes, "totalPlaintextBytes");
  if (
    !(value.plaintextHash instanceof Uint8Array) ||
    value.plaintextHash.length !== 32
  ) {
    throw new BlobCryptoError("Manifest plaintextHash must be exactly 32 bytes");
  }
  if (
    !Array.isArray(value.encryptedChunkHashes) ||
    value.encryptedChunkHashes.length !== value.totalChunks
  ) {
    throw new BlobCryptoError("Manifest chunk hash count is invalid");
  }
  for (const [index, hash] of value.encryptedChunkHashes.entries()) {
    if (!(hash instanceof Uint8Array) || hash.length !== 32) {
      throw new BlobCryptoError(
        `Manifest chunk hash ${index} must be exactly 32 bytes`,
      );
    }
  }
}

export function assertEncryptedBlobManifest(
  value: unknown,
): asserts value is EncryptedBlobManifestV1 {
  assertObject(value, "encrypted blob manifest");
  assertExactKeys(
    value,
    [
      "protocolVersion",
      "blobVersion",
      "suiteId",
      "vaultId",
      "blobId",
      "keyEpoch",
      "totalChunks",
      "totalPlaintextBytes",
      "nonce",
      "ciphertext",
    ],
    "encrypted blob manifest",
  );
  assertBaseHeader(value);
  assertPositiveInteger(value.totalChunks, "totalChunks");
  if ((value.totalChunks as number) > MAX_BLOB_CHUNKS) {
    throw new BlobCryptoError("Manifest totalChunks exceeds the protocol limit");
  }
  assertNonNegativeInteger(value.totalPlaintextBytes, "totalPlaintextBytes");
  if (
    !(value.ciphertext instanceof Uint8Array) ||
    value.ciphertext.length < 17 ||
    value.ciphertext.length > MAX_BLOB_MANIFEST_CIPHERTEXT_BYTES
  ) {
    throw new BlobCryptoError("Manifest ciphertext size is invalid");
  }
}

export function encodeEncryptedBlobManifest(
  manifest: EncryptedBlobManifestV1,
) {
  assertEncryptedBlobManifest(manifest);
  return encodeCanonical(manifest);
}

export function decodeEncryptedBlobManifest(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_ENCODED_BLOB_MANIFEST_BYTES) {
    throw new BlobCryptoError("Encoded blob manifest size is invalid");
  }
  const value = decodeCanonical(bytes);
  assertEncryptedBlobManifest(value);
  return value;
}

export function createEncryptedBlobManifest(
  crypto: E2eeCryptoProvider,
  input: {
    blobDataKey: Uint8Array;
    payload: Omit<BlobManifestPayloadV1, "protocolVersion" | "blobVersion">;
  },
): EncryptedBlobManifestV1 {
  if (input.blobDataKey.length !== BLOB_DATA_KEY_BYTES) {
    throw new BlobCryptoError(
      `Blob data key must be exactly ${BLOB_DATA_KEY_BYTES} bytes`,
    );
  }
  const payload: BlobManifestPayloadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    blobVersion: BLOB_FORMAT_VERSION,
    ...input.payload,
  };
  assertBlobManifestPayload(payload);
  const plaintext = encodeCanonical(payload);
  if (plaintext.length + 16 > MAX_BLOB_MANIFEST_CIPHERTEXT_BYTES) {
    crypto.clear(plaintext);
    throw new BlobCryptoError("Blob manifest plaintext is too large");
  }

  const nonce = crypto.randomBytes(crypto.aeadNonceBytes);
  const aad: BlobManifestAadV1 = {
    protocolVersion: E2EE_PROTOCOL_VERSION,
    blobVersion: BLOB_FORMAT_VERSION,
    suiteId: E2EE_CRYPTO_SUITE,
    vaultId: payload.vaultId,
    blobId: payload.blobId,
    keyEpoch: payload.keyEpoch,
    totalChunks: payload.totalChunks,
    totalPlaintextBytes: payload.totalPlaintextBytes,
    nonce,
  };
  try {
    const { ciphertext } = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(aad),
      key: input.blobDataKey,
      nonce,
    });
    return { ...aad, ciphertext };
  } finally {
    crypto.clear(plaintext);
  }
}

export function openEncryptedBlobManifest(
  crypto: E2eeCryptoProvider,
  manifest: EncryptedBlobManifestV1,
  blobDataKey: Uint8Array,
) {
  assertEncryptedBlobManifest(manifest);
  if (blobDataKey.length !== BLOB_DATA_KEY_BYTES) {
    throw new BlobCryptoError(
      `Blob data key must be exactly ${BLOB_DATA_KEY_BYTES} bytes`,
    );
  }

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext: manifest.ciphertext,
      additionalData: encodeCanonical(manifestAad(manifest)),
      key: blobDataKey,
      nonce: manifest.nonce,
    });
  } catch {
    throw new CryptoAuthenticationError();
  }

  try {
    const payload = decodeCanonical(plaintext);
    assertBlobManifestPayload(payload);
    if (
      payload.vaultId !== manifest.vaultId ||
      payload.blobId !== manifest.blobId ||
      payload.keyEpoch !== manifest.keyEpoch ||
      payload.totalChunks !== manifest.totalChunks ||
      payload.totalPlaintextBytes !== manifest.totalPlaintextBytes
    ) {
      throw new BlobCryptoError(
        "Blob manifest payload context does not match its envelope",
      );
    }
    return payload;
  } finally {
    crypto.clear(plaintext);
  }
}

export function verifyBlobPlaintextHash(
  manifest: BlobManifestPayloadV1,
  plaintextHash: Uint8Array,
) {
  assertBlobManifestPayload(manifest);
  if (plaintextHash.length !== 32 || !bytesEqual(manifest.plaintextHash, plaintextHash)) {
    throw new BlobCryptoError("Blob plaintext hash does not match manifest");
  }
}

export function verifyBlobChunksAgainstManifest(
  crypto: E2eeCryptoProvider,
  manifest: BlobManifestPayloadV1,
  chunks: readonly EncryptedBlobChunkV1[],
) {
  assertBlobManifestPayload(manifest);
  if (chunks.length !== manifest.totalChunks) {
    throw new BlobCryptoError("Blob chunk set is incomplete");
  }

  const ordered: EncryptedBlobChunkV1[] = new Array(manifest.totalChunks);
  let totalPlaintextBytes = 0;
  for (const chunk of chunks) {
    assertEncryptedBlobChunk(chunk);
    if (
      chunk.vaultId !== manifest.vaultId ||
      chunk.blobId !== manifest.blobId ||
      chunk.keyEpoch !== manifest.keyEpoch ||
      chunk.totalChunks !== manifest.totalChunks
    ) {
      throw new BlobCryptoError("Blob chunk context does not match manifest");
    }
    if (ordered[chunk.chunkIndex]) {
      throw new BlobCryptoError("Blob chunk set contains a duplicate index");
    }
    if (
      !bytesEqual(
        encryptedBlobChunkHash(crypto, chunk),
        manifest.encryptedChunkHashes[chunk.chunkIndex],
      )
    ) {
      throw new BlobCryptoError("Blob chunk hash does not match manifest");
    }
    ordered[chunk.chunkIndex] = chunk;
    totalPlaintextBytes += chunk.plaintextBytes;
    if (!Number.isSafeInteger(totalPlaintextBytes)) {
      throw new BlobCryptoError("Blob plaintext size exceeds safe integer range");
    }
  }

  if (
    ordered.some((chunk) => !chunk) ||
    totalPlaintextBytes !== manifest.totalPlaintextBytes
  ) {
    throw new BlobCryptoError("Blob chunk set is incomplete or truncated");
  }
  return ordered;
}
