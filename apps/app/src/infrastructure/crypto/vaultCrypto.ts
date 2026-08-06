import { vaultCryptoProvider } from "@/sync/cryptoProvider";

/**
 * Convenience shape over the active `E2eeCryptoProvider`. Every primitive is
 * the provider's, so the browser and the device run identical constructions;
 * only the argument order is local, for the wrapper code that predates the
 * provider interface.
 */
export function randomBytes(length: number): Uint8Array {
  return vaultCryptoProvider.randomBytes(length);
}

export function encrypt(
  plaintext: Uint8Array,
  aad: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const publicNonce =
    nonce ?? vaultCryptoProvider.randomBytes(vaultCryptoProvider.aeadNonceBytes);
  const { ciphertext } = vaultCryptoProvider.encrypt({
    plaintext,
    additionalData: aad,
    key,
    nonce: publicNonce,
  });
  return { nonce: publicNonce, ciphertext };
}

export function decrypt(
  ciphertext: Uint8Array,
  aad: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  return vaultCryptoProvider.decrypt({
    ciphertext,
    additionalData: aad,
    key,
    nonce,
  });
}

export function hash(message: Uint8Array, key?: Uint8Array): Uint8Array {
  return key
    ? vaultCryptoProvider.keyedHash(message, key)
    : vaultCryptoProvider.hash(message);
}

export function signingPair(seed: Uint8Array) {
  return vaultCryptoProvider.signingKeyPairFromSeed(seed);
}

export function agreementPair(seed: Uint8Array) {
  return vaultCryptoProvider.agreementKeyPairFromSeed(seed);
}

export async function derivePassphraseKey(
  passphrase: string,
  salt: Uint8Array,
  operations = 2,
  memoryBytes = 64 * 1024 * 1024,
): Promise<Uint8Array> {
  if (new TextEncoder().encode(passphrase.normalize("NFKC")).length > 1024) {
    throw new Error("Passphrase is too long");
  }
  return vaultCryptoProvider.deriveArgon2idKey({
    password: passphrase.normalize("NFKC"),
    salt,
    outputLength: 32,
    opsLimit: operations,
    memLimitBytes: memoryBytes,
  });
}

export function zeroize(...values: Uint8Array[]): void {
  values.forEach((value) => vaultCryptoProvider.clear(value));
}
