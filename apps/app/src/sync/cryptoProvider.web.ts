import { createSodiumCryptoProvider } from "@giraffle/protocol/src/sodium-provider";
import {
  E2EE_CRYPTO_SUITE,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";

let sodiumProvider: E2eeCryptoProvider | null = null;

export async function initializeCrypto(): Promise<void> {
  sodiumProvider ??= await createSodiumCryptoProvider();
}

function active(): E2eeCryptoProvider {
  if (!sodiumProvider) {
    throw new Error(
      "Crypto is not ready. Giraffle must finish loading libsodium before any vault key is used.",
    );
  }
  return sodiumProvider;
}

/**
 * Delegates to the shared `libsodium-wrappers-sumo` provider — the very build
 * the protocol test vectors are pinned against — rather than re-deriving any
 * primitive for the browser. It is a facade because that provider only exists
 * after the WebAssembly module resolves, while callers hold this binding from
 * module load.
 */
export const vaultCryptoProvider: E2eeCryptoProvider = {
  suite: E2EE_CRYPTO_SUITE,
  get aeadKeyBytes() {
    return active().aeadKeyBytes;
  },
  get aeadNonceBytes() {
    return active().aeadNonceBytes;
  },
  get argon2idSaltBytes() {
    return active().argon2idSaltBytes;
  },
  get signingSeedBytes() {
    return active().signingSeedBytes;
  },
  get agreementSeedBytes() {
    return active().agreementSeedBytes;
  },
  get agreementPublicKeyBytes() {
    return active().agreementPublicKeyBytes;
  },
  get agreementPrivateKeyBytes() {
    return active().agreementPrivateKeyBytes;
  },
  get sealedBoxOverheadBytes() {
    return active().sealedBoxOverheadBytes;
  },

  randomBytes: (length) => active().randomBytes(length),
  encrypt: (input) => active().encrypt(input),
  decrypt: (input) => active().decrypt(input),
  deriveArgon2idKey: (input) => active().deriveArgon2idKey(input),
  signingKeyPairFromSeed: (seed) => active().signingKeyPairFromSeed(seed),
  agreementKeyPairFromSeed: (seed) => active().agreementKeyPairFromSeed(seed),
  seal: (message, recipientPublicKey) => active().seal(message, recipientPublicKey),
  openSealed: (ciphertext, publicKey, privateKey) =>
    active().openSealed(ciphertext, publicKey, privateKey),
  sign: (message, privateKey) => active().sign(message, privateKey),
  verify: (message, signature, publicKey) =>
    active().verify(message, signature, publicKey),
  hash: (message, outputLength) => active().hash(message, outputLength),
  keyedHash: (message, key, outputLength) =>
    active().keyedHash(message, key, outputLength),
  clear: (bytes) => active().clear(bytes),
};
