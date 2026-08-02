import { beforeAll, describe, expect, it } from "vitest";
import {
  BlobCryptoError,
  MAX_BLOB_CHUNK_PLAINTEXT_BYTES,
  createBlobDataKey,
  createEncryptedBlobManifest,
  decodeBlobKeyWrapper,
  decodeEncryptedBlobManifest,
  decodeEncryptedBlobChunk,
  decryptBlobChunk,
  encodeBlobKeyWrapper,
  encodeEncryptedBlobManifest,
  encodeEncryptedBlobChunk,
  encryptBlobChunk,
  encryptedBlobChunkHash,
  openEncryptedBlobManifest,
  unwrapBlobDataKey,
  verifyBlobChunksAgainstManifest,
  verifyBlobPlaintextHash,
  wrapBlobDataKey,
} from "@/domain/e2ee/blob-crypto";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
} from "@/domain/e2ee/crypto-provider";

function fixedBytes(length: number, start: number) {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

describe("encrypted blob keys and chunks", () => {
  let crypto: E2eeCryptoProvider;
  const contentKey = fixedBytes(32, 0x10);
  const blobDataKey = fixedBytes(32, 0x50);

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
  });

  it("wraps a random per-blob DEK under the active content-key epoch", () => {
    const generated = createBlobDataKey(crypto, {
      vaultId: "vault-1",
      blobId: "blob-1",
      keyEpoch: 2,
      contentKey,
    });
    const encoded = encodeBlobKeyWrapper(generated.wrapper);
    const decoded = decodeBlobKeyWrapper(encoded);

    expect(encodeBlobKeyWrapper(decoded)).toEqual(encoded);
    expect(unwrapBlobDataKey(crypto, decoded, contentKey)).toEqual(
      generated.blobDataKey,
    );
    expect(generated.blobDataKey).not.toEqual(contentKey);
  });

  it("encrypts independently authenticated chunks that survive reordered transport", () => {
    const plaintextChunks = [
      new TextEncoder().encode("first chunk"),
      new TextEncoder().encode("second chunk"),
      new TextEncoder().encode("third chunk"),
    ];
    const encrypted = plaintextChunks.map((plaintext, chunkIndex) =>
      encryptBlobChunk(crypto, {
        vaultId: "vault-1",
        blobId: "blob-1",
        keyEpoch: 1,
        chunkIndex,
        totalChunks: plaintextChunks.length,
        plaintext,
        blobDataKey,
      }),
    );
    const transported = [encrypted[2], encrypted[0], encrypted[1]].map(
      (chunk) => decodeEncryptedBlobChunk(encodeEncryptedBlobChunk(chunk)),
    );
    transported.sort((left, right) => left.chunkIndex - right.chunkIndex);

    expect(
      transported.map((chunk) =>
        new TextDecoder().decode(decryptBlobChunk(crypto, chunk, blobDataKey)),
      ),
    ).toEqual(["first chunk", "second chunk", "third chunk"]);
    expect(new Set(encrypted.map((chunk) => chunk.nonce.toString())).size).toBe(3);
    expect(encryptedBlobChunkHash(crypto, encrypted[0])).toHaveLength(32);
  });

  it("encrypts private metadata and authenticates the complete chunk set", () => {
    const plaintextChunks = [
      new TextEncoder().encode("alpha"),
      new TextEncoder().encode("beta"),
      new TextEncoder().encode("gamma"),
    ];
    const chunks = plaintextChunks.map((plaintext, chunkIndex) =>
      encryptBlobChunk(crypto, {
        vaultId: "vault-1",
        blobId: "blob-manifest",
        keyEpoch: 3,
        chunkIndex,
        totalChunks: plaintextChunks.length,
        plaintext,
        blobDataKey,
      }),
    );
    const allPlaintext = new Uint8Array(
      plaintextChunks.reduce((total, chunk) => total + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of plaintextChunks) {
      allPlaintext.set(chunk, offset);
      offset += chunk.length;
    }
    const manifest = createEncryptedBlobManifest(crypto, {
      blobDataKey,
      payload: {
        vaultId: "vault-1",
        blobId: "blob-manifest",
        keyEpoch: 3,
        fileName: "private-name.pdf",
        mediaType: "application/pdf",
        totalChunks: chunks.length,
        totalPlaintextBytes: allPlaintext.length,
        plaintextHash: crypto.hash(allPlaintext, 32),
        encryptedChunkHashes: chunks.map((chunk) =>
          encryptedBlobChunkHash(crypto, chunk),
        ),
      },
    });
    const encoded = encodeEncryptedBlobManifest(manifest);
    const decoded = decodeEncryptedBlobManifest(encoded);
    const payload = openEncryptedBlobManifest(crypto, decoded, blobDataKey);

    expect(encodeEncryptedBlobManifest(decoded)).toEqual(encoded);
    expect(payload.fileName).toBe("private-name.pdf");
    expect(() =>
      verifyBlobPlaintextHash(payload, crypto.hash(allPlaintext, 32)),
    ).not.toThrow();
    expect(() =>
      verifyBlobPlaintextHash(payload, new Uint8Array(32)),
    ).toThrow(/plaintext hash/);
    expect(
      verifyBlobChunksAgainstManifest(
        crypto,
        payload,
        [chunks[2], chunks[0], chunks[1]],
      ).map((chunk) => chunk.chunkIndex),
    ).toEqual([0, 1, 2]);

    expect(() =>
      verifyBlobChunksAgainstManifest(crypto, payload, chunks.slice(1)),
    ).toThrow(/incomplete/);
    expect(() =>
      verifyBlobChunksAgainstManifest(crypto, payload, [
        chunks[0],
        chunks[0],
        chunks[2],
      ]),
    ).toThrow(/duplicate index/);

    const corrupted = structuredClone(chunks[1]);
    corrupted.ciphertext[0] ^= 1;
    expect(() =>
      verifyBlobChunksAgainstManifest(crypto, payload, [
        chunks[0],
        corrupted,
        chunks[2],
      ]),
    ).toThrow(/hash does not match/);
  });

  it("rejects manifest metadata substitution through AEAD", () => {
    const manifest = createEncryptedBlobManifest(crypto, {
      blobDataKey,
      payload: {
        vaultId: "vault-1",
        blobId: "blob-manifest",
        keyEpoch: 1,
        fileName: "secret.txt",
        mediaType: "text/plain",
        totalChunks: 1,
        totalPlaintextBytes: 3,
        plaintextHash: crypto.hash(new Uint8Array([1, 2, 3]), 32),
        encryptedChunkHashes: [new Uint8Array(32)],
      },
    });

    expect(() =>
      openEncryptedBlobManifest(
        crypto,
        { ...manifest, totalPlaintextBytes: 4 },
        blobDataKey,
      ),
    ).toThrow(CryptoAuthenticationError);
  });

  it("rejects chunk relocation, index substitution, and ciphertext corruption", () => {
    const chunk = encryptBlobChunk(crypto, {
      vaultId: "vault-1",
      blobId: "blob-1",
      keyEpoch: 1,
      chunkIndex: 0,
      totalChunks: 2,
      plaintext: new TextEncoder().encode("content"),
      blobDataKey,
    });
    const moved = { ...chunk, blobId: "blob-2" };
    const reindexed = { ...chunk, chunkIndex: 1 };
    const corrupted = structuredClone(chunk);
    corrupted.ciphertext[0] ^= 1;

    for (const candidate of [moved, reindexed, corrupted]) {
      expect(() => decryptBlobChunk(crypto, candidate, blobDataKey)).toThrow(
        CryptoAuthenticationError,
      );
    }
  });

  it("rejects the wrong content key and blob data key", () => {
    const wrapper = wrapBlobDataKey(crypto, {
      vaultId: "vault-1",
      blobId: "blob-1",
      keyEpoch: 1,
      contentKey,
      blobDataKey,
    });
    const chunk = encryptBlobChunk(crypto, {
      vaultId: "vault-1",
      blobId: "blob-1",
      keyEpoch: 1,
      chunkIndex: 0,
      totalChunks: 1,
      plaintext: new Uint8Array([1, 2, 3]),
      blobDataKey,
    });

    expect(() =>
      unwrapBlobDataKey(crypto, wrapper, fixedBytes(32, 0x20)),
    ).toThrow(CryptoAuthenticationError);
    expect(() =>
      decryptBlobChunk(crypto, chunk, fixedBytes(32, 0x70)),
    ).toThrow(CryptoAuthenticationError);
  });

  it("enforces chunk counts, indexes, sizes, and wrapper context", () => {
    expect(() =>
      encryptBlobChunk(crypto, {
        vaultId: "vault-1",
        blobId: "blob-1",
        keyEpoch: 1,
        chunkIndex: 1,
        totalChunks: 1,
        plaintext: new Uint8Array(),
        blobDataKey,
      }),
    ).toThrow(/chunkIndex/);
    expect(() =>
      encryptBlobChunk(crypto, {
        vaultId: "vault-1",
        blobId: "blob-1",
        keyEpoch: 1,
        chunkIndex: 0,
        totalChunks: 1,
        plaintext: new Uint8Array(MAX_BLOB_CHUNK_PLAINTEXT_BYTES + 1),
        blobDataKey,
      }),
    ).toThrow(/protocol limit/);
    expect(() => decodeBlobKeyWrapper(new Uint8Array(1025))).toThrow(
      BlobCryptoError,
    );
  });
});
