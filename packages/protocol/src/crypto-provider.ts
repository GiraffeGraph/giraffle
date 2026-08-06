export const E2EE_CRYPTO_SUITE = "xchacha20poly1305-argon2id-ed25519-v1" as const;

export interface AeadEncryptionInput {
  plaintext: Uint8Array;
  additionalData: Uint8Array;
  key: Uint8Array;
  nonce?: Uint8Array;
}

export interface AeadDecryptionInput {
  ciphertext: Uint8Array;
  additionalData: Uint8Array;
  key: Uint8Array;
  nonce: Uint8Array;
}

export interface Argon2idInput {
  password: string;
  salt: Uint8Array;
  outputLength: number;
  opsLimit: number;
  memLimitBytes: number;
}

export interface SigningKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface AgreementKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface E2eeCryptoProvider {
  readonly suite: typeof E2EE_CRYPTO_SUITE;
  readonly aeadKeyBytes: number;
  readonly aeadNonceBytes: number;
  readonly argon2idSaltBytes: number;
  readonly signingSeedBytes: number;
  readonly agreementSeedBytes: number;
  readonly agreementPublicKeyBytes: number;
  readonly agreementPrivateKeyBytes: number;
  readonly sealedBoxOverheadBytes: number;
  randomBytes(length: number): Uint8Array;
  encrypt(input: AeadEncryptionInput): {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  };
  decrypt(input: AeadDecryptionInput): Uint8Array;
  deriveArgon2idKey(input: Argon2idInput): Uint8Array;
  signingKeyPairFromSeed(seed: Uint8Array): SigningKeyPair;
  agreementKeyPairFromSeed(seed: Uint8Array): AgreementKeyPair;
  seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
  openSealed(
    ciphertext: Uint8Array,
    recipientPublicKey: Uint8Array,
    recipientPrivateKey: Uint8Array,
  ): Uint8Array;
  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;
  hash(message: Uint8Array, outputLength?: number): Uint8Array;
  keyedHash(
    message: Uint8Array,
    key: Uint8Array,
    outputLength?: number,
  ): Uint8Array;
  clear(bytes: Uint8Array): void;
}

export class CryptoAuthenticationError extends Error {
  constructor() {
    super("Encrypted record authentication failed");
    this.name = "CryptoAuthenticationError";
  }
}

export function assertByteLength(value: Uint8Array, expected: number, label: string) {
  if (value.length !== expected) {
    throw new RangeError(`${label} must be exactly ${expected} bytes`);
  }
}

export function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}
