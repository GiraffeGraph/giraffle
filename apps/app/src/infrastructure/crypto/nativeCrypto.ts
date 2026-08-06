import { encode } from "cborg";
import {
  ready, randombytes_buf, crypto_aead_xchacha20poly1305_ietf_encrypt,
  crypto_aead_xchacha20poly1305_ietf_decrypt, crypto_generichash,
  crypto_sign_seed_keypair, crypto_sign_detached, crypto_sign_verify_detached,
  crypto_box_seed_keypair, crypto_box_seal, crypto_box_seal_open,
  crypto_pwhash, crypto_pwhash_ALG_ARGON2ID13
} from "react-native-libsodium";
import type { VaultKeys } from "../secure-storage/keyStore";

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
export function randomBytes(length: number): Uint8Array { return randombytes_buf(length); }
export function encrypt(plaintext: Uint8Array, aad: Uint8Array, key: Uint8Array, nonce = randomBytes(24)) { return { nonce, ciphertext: crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key) }; }
export function decrypt(ciphertext: Uint8Array, aad: Uint8Array, key: Uint8Array, nonce: Uint8Array): Uint8Array { return crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key); }
export function hash(message: Uint8Array, key?: Uint8Array): Uint8Array { return crypto_generichash(32, message, key ?? null); }
export function signingPair(seed: Uint8Array) { return crypto_sign_seed_keypair(seed); }
export function agreementPair(seed: Uint8Array) { return crypto_box_seed_keypair(seed); }
export function sign(message: Uint8Array, privateKey: Uint8Array) { return crypto_sign_detached(message, privateKey); }
export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) { return crypto_sign_verify_detached(signature, message, publicKey); }
export function seal(message: Uint8Array, publicKey: Uint8Array) { return crypto_box_seal(message, publicKey); }
export function openSeal(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) { return crypto_box_seal_open(ciphertext, publicKey, privateKey); }
export async function derivePassphraseKey(passphrase: string, salt: Uint8Array, operations = 2, memoryBytes = 64 * 1024 * 1024): Promise<Uint8Array> {
  if (new TextEncoder().encode(passphrase.normalize("NFKC")).length > 1024) throw new Error("Passphrase is too long");
  return crypto_pwhash(
    32,
    passphrase.normalize("NFKC"),
    salt,
    operations,
    memoryBytes,
    crypto_pwhash_ALG_ARGON2ID13,
  );
}
export interface EncryptedOperation { recordId: string; deviceSequence: number; objectLocator: Uint8Array; previousRecordHash: Uint8Array; keyEpoch: 1; nonce: Uint8Array; ciphertext: Uint8Array; signature: Uint8Array; encoded: Uint8Array; recordHash: Uint8Array }
export function createEncryptedOperation(input: { recordId: string; vaultId: string; deviceId: string; deviceSequence: number; previousRecordHash: Uint8Array; objectId: string; kind: string; data: unknown; keys: VaultKeys }): EncryptedOperation {
  const objectLocator = hash(encode(["giraffle-object-locator", 1, input.vaultId, input.objectId]), input.keys.locatorKey);
  const suiteId = "xchacha20poly1305-argon2id-ed25519-v1";
  const aad = encode({ protocolVersion: 1, suiteId, vaultId: input.vaultId, recordId: input.recordId, objectLocator, deviceId: input.deviceId, deviceSequence: input.deviceSequence, schemaVersion: 1, keyEpoch: 1 });
  const operation = encode({ protocolVersion: 1, operationId: input.recordId, objectId: input.objectId, objectType: input.kind.split(".")[0] ?? "object", schemaVersion: 1, clock: { physicalMs: Date.now(), logical: 0 }, mutation: { kind: input.kind, data: input.data as never } });
  const encrypted = encrypt(operation, aad, input.keys.contentKey);
  const unsigned = { protocolVersion: 1, recordId: input.recordId, vaultId: input.vaultId, deviceId: input.deviceId, deviceSequence: input.deviceSequence, previousRecordHash: input.previousRecordHash, objectLocator, keyEpoch: 1, envelope: { protocolVersion: 1, suiteId, schemaVersion: 1, keyEpoch: 1, nonce: encrypted.nonce, ciphertext: encrypted.ciphertext } };
  const unsignedBytes = encode(unsigned);
  const signature = sign(unsignedBytes, signingPair(input.keys.signingSeed).privateKey);
  const encoded = encode({ ...unsigned, signature });
  return { recordId: input.recordId, deviceSequence: input.deviceSequence, objectLocator, previousRecordHash: input.previousRecordHash, keyEpoch: 1, nonce: encrypted.nonce, ciphertext: encrypted.ciphertext, signature, encoded, recordHash: hash(encoded) };
}
export function zeroize(...values: Uint8Array[]): void { values.forEach((value) => value.fill(0)); }
