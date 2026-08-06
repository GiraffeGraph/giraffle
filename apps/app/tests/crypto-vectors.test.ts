import sodium, { ready } from "libsodium-wrappers-sumo";
import vector from "../../../tests/vectors/e2ee-v1.json";

const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
const hex = (value: Uint8Array) =>
  [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * The client must agree byte-for-byte with the web build, so every primitive is
 * pinned against the shared fixture rather than against itself.
 */
describe("cross-platform crypto compatibility fixture", () => {
  beforeAll(async () => {
    await ready;
  });

  test("the fixture names the suite this client implements", () => {
    expect(vector.version).toBe(1);
    expect(vector.suite).toBe("xchacha20poly1305-argon2id-ed25519-v1");
  });

  test("XChaCha20-Poly1305 encrypts to the fixture ciphertext", () => {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      bytes(vector.aead.plaintext),
      bytes(vector.aead.aad),
      null,
      bytes(vector.aead.nonce),
      bytes(vector.aead.key),
    );

    expect(hex(ciphertext)).toBe(vector.aead.ciphertext);
  });

  test("XChaCha20-Poly1305 decrypts the fixture ciphertext back", () => {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      bytes(vector.aead.ciphertext),
      bytes(vector.aead.aad),
      bytes(vector.aead.nonce),
      bytes(vector.aead.key),
    );

    expect(hex(plaintext)).toBe(vector.aead.plaintext);
  });

  test("associated data is authenticated, not decorative", () => {
    expect(() =>
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        bytes(vector.aead.ciphertext),
        bytes("00"),
        bytes(vector.aead.nonce),
        bytes(vector.aead.key),
      ),
    ).toThrow();
  });

  test("a flipped ciphertext bit fails the tag instead of returning plaintext", () => {
    const tampered = bytes(vector.aead.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;

    expect(() =>
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        tampered,
        bytes(vector.aead.aad),
        bytes(vector.aead.nonce),
        bytes(vector.aead.key),
      ),
    ).toThrow();
  });

  test("Ed25519 derives the fixture identity and signature", () => {
    const pair = sodium.crypto_sign_seed_keypair(bytes(vector.signing.seed));

    expect(hex(pair.publicKey)).toBe(vector.signing.publicKey);
    expect(hex(pair.privateKey)).toBe(vector.signing.privateKey);
    expect(hex(sodium.crypto_sign_detached(bytes(vector.signing.message), pair.privateKey))).toBe(
      vector.signing.signature,
    );
    expect(
      sodium.crypto_sign_verify_detached(
        bytes(vector.signing.signature),
        bytes(vector.signing.message),
        bytes(vector.signing.publicKey),
      ),
    ).toBe(true);
  });

  test("a signature does not verify against a different message", () => {
    expect(
      sodium.crypto_sign_verify_detached(
        bytes(vector.signing.signature),
        bytes(`${vector.signing.message}00`),
        bytes(vector.signing.publicKey),
      ),
    ).toBe(false);
  });

  test("BLAKE2b matches both unkeyed and keyed", () => {
    expect(hex(sodium.crypto_generichash(32, bytes(vector.hash.message), null))).toBe(
      vector.hash.digest,
    );
    expect(
      hex(
        sodium.crypto_generichash(
          32,
          bytes(vector.keyedHash.message),
          bytes(vector.keyedHash.key),
        ),
      ),
    ).toBe(vector.keyedHash.digest);
  });

  test("Argon2id derives the fixture key from the fixture parameters", () => {
    expect(
      hex(
        sodium.crypto_pwhash(
          vector.argon2id.outputLength,
          vector.argon2id.password,
          bytes(vector.argon2id.salt),
          vector.argon2id.opsLimit,
          vector.argon2id.memLimitBytes,
          sodium.crypto_pwhash_ALG_ARGON2ID13,
        ),
      ),
    ).toBe(vector.argon2id.derivedKey);
  });

  test("a sealed box written by the web build opens on this client", () => {
    const pair = sodium.crypto_box_seed_keypair(bytes(vector.sealedBox.seed));

    expect(hex(pair.publicKey)).toBe(vector.sealedBox.publicKey);
    expect(hex(pair.privateKey)).toBe(vector.sealedBox.privateKey);
    expect(
      hex(
        sodium.crypto_box_seal_open(
          bytes(vector.sealedBox.sealedCiphertext),
          pair.publicKey,
          pair.privateKey,
        ),
      ),
    ).toBe(vector.sealedBox.plaintext);
  });
});
