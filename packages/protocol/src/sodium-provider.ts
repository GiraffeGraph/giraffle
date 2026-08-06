import sodium from "libsodium-wrappers-sumo";

import {
  assertByteLength,
  assertPositiveInteger,
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "./crypto-provider";

/**
 * Deliberately outside the package barrel. This is the WebAssembly build and
 * Hermes has no WebAssembly, so a native import of @giraffle/protocol must not
 * be able to reach it — React Native implements the same interface with
 * react-native-libsodium instead.
 */
export async function createSodiumCryptoProvider(): Promise<E2eeCryptoProvider> {
  await sodium.ready;

  return {
    suite: E2EE_CRYPTO_SUITE,
    aeadKeyBytes: sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    aeadNonceBytes: sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    argon2idSaltBytes: sodium.crypto_pwhash_SALTBYTES,
    signingSeedBytes: sodium.crypto_sign_SEEDBYTES,
    agreementSeedBytes: sodium.crypto_box_SEEDBYTES,
    agreementPublicKeyBytes: sodium.crypto_box_PUBLICKEYBYTES,
    agreementPrivateKeyBytes: sodium.crypto_box_SECRETKEYBYTES,
    sealedBoxOverheadBytes: sodium.crypto_box_SEALBYTES,

    randomBytes(length) {
      assertPositiveInteger(length, "length");
      return sodium.randombytes_buf(length);
    },

    encrypt({ plaintext, additionalData, key, nonce }) {
      assertByteLength(
        key,
        sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
        "AEAD key",
      );

      const publicNonce = nonce ?? sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
      );
      assertByteLength(
        publicNonce,
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
        "AEAD nonce",
      );

      return {
        ciphertext: sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          plaintext,
          additionalData,
          null,
          publicNonce,
          key,
        ),
        nonce: publicNonce,
      };
    },

    decrypt({ ciphertext, additionalData, key, nonce }) {
      assertByteLength(
        key,
        sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
        "AEAD key",
      );
      assertByteLength(
        nonce,
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
        "AEAD nonce",
      );

      try {
        return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          ciphertext,
          additionalData,
          nonce,
          key,
        );
      } catch {
        throw new CryptoAuthenticationError();
      }
    },

    deriveArgon2idKey({
      password,
      salt,
      outputLength,
      opsLimit,
      memLimitBytes,
    }) {
      assertByteLength(salt, sodium.crypto_pwhash_SALTBYTES, "Argon2id salt");
      assertPositiveInteger(outputLength, "outputLength");
      assertPositiveInteger(opsLimit, "opsLimit");
      assertPositiveInteger(memLimitBytes, "memLimitBytes");

      return sodium.crypto_pwhash(
        outputLength,
        password,
        salt,
        opsLimit,
        memLimitBytes,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
    },

    signingKeyPairFromSeed(seed) {
      assertByteLength(seed, sodium.crypto_sign_SEEDBYTES, "Ed25519 seed");
      const pair = sodium.crypto_sign_seed_keypair(seed);
      return {
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
      };
    },

    agreementKeyPairFromSeed(seed) {
      assertByteLength(seed, sodium.crypto_box_SEEDBYTES, "X25519 seed");
      const pair = sodium.crypto_box_seed_keypair(seed);
      return {
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
      };
    },

    seal(message, recipientPublicKey) {
      assertByteLength(
        recipientPublicKey,
        sodium.crypto_box_PUBLICKEYBYTES,
        "Agreement public key",
      );
      return sodium.crypto_box_seal(message, recipientPublicKey);
    },

    openSealed(ciphertext, recipientPublicKey, recipientPrivateKey) {
      assertByteLength(
        recipientPublicKey,
        sodium.crypto_box_PUBLICKEYBYTES,
        "Agreement public key",
      );
      assertByteLength(
        recipientPrivateKey,
        sodium.crypto_box_SECRETKEYBYTES,
        "Agreement private key",
      );
      if (ciphertext.length < sodium.crypto_box_SEALBYTES) {
        throw new CryptoAuthenticationError();
      }

      try {
        return sodium.crypto_box_seal_open(
          ciphertext,
          recipientPublicKey,
          recipientPrivateKey,
        );
      } catch {
        throw new CryptoAuthenticationError();
      }
    },

    sign(message, privateKey) {
      assertByteLength(
        privateKey,
        sodium.crypto_sign_SECRETKEYBYTES,
        "Ed25519 private key",
      );
      return sodium.crypto_sign_detached(message, privateKey);
    },

    verify(message, signature, publicKey) {
      assertByteLength(
        signature,
        sodium.crypto_sign_BYTES,
        "Ed25519 signature",
      );
      assertByteLength(
        publicKey,
        sodium.crypto_sign_PUBLICKEYBYTES,
        "Ed25519 public key",
      );
      return sodium.crypto_sign_verify_detached(signature, message, publicKey);
    },

    hash(message, outputLength = 32) {
      assertPositiveInteger(outputLength, "outputLength");
      return sodium.crypto_generichash(outputLength, message, null);
    },

    keyedHash(message, key, outputLength = 32) {
      assertPositiveInteger(outputLength, "outputLength");
      if (
        key.length < sodium.crypto_generichash_KEYBYTES_MIN ||
        key.length > sodium.crypto_generichash_KEYBYTES_MAX
      ) {
        throw new RangeError(
          `Hash key must be between ${sodium.crypto_generichash_KEYBYTES_MIN} and ${sodium.crypto_generichash_KEYBYTES_MAX} bytes`,
        );
      }
      return sodium.crypto_generichash(outputLength, message, key);
    },

    clear(bytes) {
      sodium.memzero(bytes);
    },
  };
}
