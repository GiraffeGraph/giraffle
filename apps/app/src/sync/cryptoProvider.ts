import {
  CryptoAuthenticationError,
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";
import {
  crypto_aead_xchacha20poly1305_ietf_decrypt,
  crypto_aead_xchacha20poly1305_ietf_encrypt,
  crypto_box_seal,
  crypto_box_seal_open,
  crypto_box_seed_keypair,
  crypto_generichash,
  crypto_pwhash,
  crypto_pwhash_ALG_ARGON2ID13,
  crypto_sign_detached,
  crypto_sign_seed_keypair,
  crypto_sign_verify_detached,
  randombytes_buf,
  ready,
} from "react-native-libsodium";

// Fixed by the suite this vault is pinned to. Reading them from the binding
// instead would capture undefined, because those exports are only filled in
// once libsodium finishes loading.
const AEAD_KEY_BYTES = 32;
const AEAD_NONCE_BYTES = 24;
const ARGON2ID_SALT_BYTES = 16;
const SIGNING_SEED_BYTES = 32;
const AGREEMENT_SEED_BYTES = 32;
const AGREEMENT_PUBLIC_KEY_BYTES = 32;
const AGREEMENT_PRIVATE_KEY_BYTES = 32;
const SEALED_BOX_OVERHEAD_BYTES = 48;

export async function initializeCrypto(): Promise<void> {
  await ready;
  // The libsodium JSI bindings only exist in a native build; Expo Go leaves
  // every jsi_* global undefined, so fail here instead of at vault creation.
  try {
    randombytes_buf(1);
  } catch {
    throw new Error(
      "Native crypto is unavailable. Giraffle needs a development build (expo run:ios / expo run:android) — Expo Go cannot load its native modules.",
    );
  }
}

/**
 * The shared protocol and merge packages are written against
 * `E2eeCryptoProvider`. This binds that contract to the native libsodium build
 * so the client runs the same record, wrapper and merge code as the test suite,
 * rather than a second hand-written copy of it.
 */
export const vaultCryptoProvider: E2eeCryptoProvider = {
  suite: E2EE_CRYPTO_SUITE,
  aeadKeyBytes: AEAD_KEY_BYTES,
  aeadNonceBytes: AEAD_NONCE_BYTES,
  argon2idSaltBytes: ARGON2ID_SALT_BYTES,
  signingSeedBytes: SIGNING_SEED_BYTES,
  agreementSeedBytes: AGREEMENT_SEED_BYTES,
  agreementPublicKeyBytes: AGREEMENT_PUBLIC_KEY_BYTES,
  agreementPrivateKeyBytes: AGREEMENT_PRIVATE_KEY_BYTES,
  sealedBoxOverheadBytes: SEALED_BOX_OVERHEAD_BYTES,

  randomBytes(length) {
    return randombytes_buf(length);
  },

  encrypt({ plaintext, additionalData, key, nonce }) {
    const publicNonce = nonce ?? randombytes_buf(AEAD_NONCE_BYTES);
    return {
      ciphertext: crypto_aead_xchacha20poly1305_ietf_encrypt(
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
    try {
      return crypto_aead_xchacha20poly1305_ietf_decrypt(
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

  deriveArgon2idKey({ password, salt, outputLength, opsLimit, memLimitBytes }) {
    return crypto_pwhash(
      outputLength,
      password,
      salt,
      opsLimit,
      memLimitBytes,
      crypto_pwhash_ALG_ARGON2ID13,
    );
  },

  signingKeyPairFromSeed(seed) {
    const pair = crypto_sign_seed_keypair(seed);
    return { publicKey: pair.publicKey, privateKey: pair.privateKey };
  },

  agreementKeyPairFromSeed(seed) {
    const pair = crypto_box_seed_keypair(seed);
    return { publicKey: pair.publicKey, privateKey: pair.privateKey };
  },

  seal(message, recipientPublicKey) {
    return crypto_box_seal(message, recipientPublicKey);
  },

  openSealed(ciphertext, recipientPublicKey, recipientPrivateKey) {
    try {
      return crypto_box_seal_open(ciphertext, recipientPublicKey, recipientPrivateKey);
    } catch {
      throw new CryptoAuthenticationError();
    }
  },

  sign(message, privateKey) {
    return crypto_sign_detached(message, privateKey);
  },

  verify(message, signature, publicKey) {
    try {
      return crypto_sign_verify_detached(signature, message, publicKey);
    } catch {
      return false;
    }
  },

  hash(message, outputLength = 32) {
    return crypto_generichash(outputLength, message, null);
  },

  keyedHash(message, key, outputLength = 32) {
    return crypto_generichash(outputLength, message, key);
  },

  clear(bytes) {
    // react-native-libsodium exposes no memzero, and a JS caller cannot get
    // libsodium's compiler barrier anyway — the array is all we can reach.
    bytes.fill(0);
  },
};
