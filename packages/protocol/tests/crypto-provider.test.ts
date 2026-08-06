import { beforeAll, describe, expect, it } from "vitest";
import {
  CryptoAuthenticationError,
  createSodiumCryptoProvider,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";
import vectors from "../../../tests/vectors/e2ee-v1.json";

function fromHex(value: string) {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new Error("Invalid hexadecimal test vector");
  }

  return Uint8Array.from(
    value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("E2EE crypto provider protocol vectors", () => {
  let crypto: E2eeCryptoProvider;

  beforeAll(async () => {
    crypto = await createSodiumCryptoProvider();
  });

  it("matches the XChaCha20-Poly1305 compatibility vector", () => {
    expect(crypto.suite).toBe(vectors.suite);

    const encrypted = crypto.encrypt({
      key: fromHex(vectors.aead.key),
      nonce: fromHex(vectors.aead.nonce),
      additionalData: fromHex(vectors.aead.aad),
      plaintext: fromHex(vectors.aead.plaintext),
    });

    expect(toHex(encrypted.nonce)).toBe(vectors.aead.nonce);
    expect(toHex(encrypted.ciphertext)).toBe(vectors.aead.ciphertext);

    const decrypted = crypto.decrypt({
      key: fromHex(vectors.aead.key),
      nonce: encrypted.nonce,
      additionalData: fromHex(vectors.aead.aad),
      ciphertext: encrypted.ciphertext,
    });

    expect(toHex(decrypted)).toBe(vectors.aead.plaintext);
  });

  it("rejects ciphertext corruption and AAD substitution", () => {
    const ciphertext = fromHex(vectors.aead.ciphertext);
    ciphertext[0] ^= 1;

    expect(() =>
      crypto.decrypt({
        key: fromHex(vectors.aead.key),
        nonce: fromHex(vectors.aead.nonce),
        additionalData: fromHex(vectors.aead.aad),
        ciphertext,
      }),
    ).toThrow(CryptoAuthenticationError);

    expect(() =>
      crypto.decrypt({
        key: fromHex(vectors.aead.key),
        nonce: fromHex(vectors.aead.nonce),
        additionalData: new TextEncoder().encode("wrong-context"),
        ciphertext: fromHex(vectors.aead.ciphertext),
      }),
    ).toThrow(CryptoAuthenticationError);
  });

  it("matches the Ed25519 signing compatibility vector", () => {
    const pair = crypto.signingKeyPairFromSeed(fromHex(vectors.signing.seed));
    const message = fromHex(vectors.signing.message);
    const signature = crypto.sign(message, pair.privateKey);

    expect(toHex(pair.publicKey)).toBe(vectors.signing.publicKey);
    expect(toHex(pair.privateKey)).toBe(vectors.signing.privateKey);
    expect(toHex(signature)).toBe(vectors.signing.signature);
    expect(crypto.verify(message, signature, pair.publicKey)).toBe(true);

    const changedMessage = message.slice();
    changedMessage[0] ^= 1;
    expect(crypto.verify(changedMessage, signature, pair.publicKey)).toBe(false);
  });

  it("opens the sealed-box compatibility vector", () => {
    const pair = crypto.agreementKeyPairFromSeed(
      fromHex(vectors.sealedBox.seed),
    );
    expect(toHex(pair.publicKey)).toBe(vectors.sealedBox.publicKey);
    expect(toHex(pair.privateKey)).toBe(vectors.sealedBox.privateKey);

    const plaintext = crypto.openSealed(
      fromHex(vectors.sealedBox.sealedCiphertext),
      pair.publicKey,
      pair.privateKey,
    );
    expect(toHex(plaintext)).toBe(vectors.sealedBox.plaintext);

    const freshCiphertext = crypto.seal(
      fromHex(vectors.sealedBox.plaintext),
      pair.publicKey,
    );
    expect(
      toHex(crypto.openSealed(freshCiphertext, pair.publicKey, pair.privateKey)),
    ).toBe(vectors.sealedBox.plaintext);
  });

  it("matches the Argon2id compatibility vector", () => {
    const derived = crypto.deriveArgon2idKey({
      password: vectors.argon2id.password,
      salt: fromHex(vectors.argon2id.salt),
      outputLength: vectors.argon2id.outputLength,
      opsLimit: vectors.argon2id.opsLimit,
      memLimitBytes: vectors.argon2id.memLimitBytes,
    });

    expect(toHex(derived)).toBe(vectors.argon2id.derivedKey);
  });

  it("matches generic and keyed hash vectors and clears secret buffers", () => {
    const digest = crypto.hash(fromHex(vectors.hash.message));
    expect(toHex(digest)).toBe(vectors.hash.digest);

    const keyedDigest = crypto.keyedHash(
      fromHex(vectors.keyedHash.message),
      fromHex(vectors.keyedHash.key),
    );
    expect(toHex(keyedDigest)).toBe(vectors.keyedHash.digest);

    const secret = fromHex(vectors.aead.key);
    crypto.clear(secret);
    expect(secret.every((byte) => byte === 0)).toBe(true);
  });

  it("validates key and nonce sizes before invoking crypto", () => {
    expect(() =>
      crypto.encrypt({
        key: new Uint8Array(31),
        nonce: fromHex(vectors.aead.nonce),
        additionalData: new Uint8Array(),
        plaintext: new Uint8Array(),
      }),
    ).toThrow(/AEAD key must be exactly 32 bytes/);

    expect(() =>
      crypto.encrypt({
        key: fromHex(vectors.aead.key),
        nonce: new Uint8Array(23),
        additionalData: new Uint8Array(),
        plaintext: new Uint8Array(),
      }),
    ).toThrow(/AEAD nonce must be exactly 24 bytes/);
  });
});
