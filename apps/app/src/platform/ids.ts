import * as Crypto from "expo-crypto";

/**
 * Hermes exposes no WebCrypto global, so the shared `generateId` would fall
 * back to a non-random string on device. Vault ids are sync identities, so the
 * client always mints them through the native CSPRNG instead.
 */
export function createId(): string {
  return Crypto.randomUUID();
}
