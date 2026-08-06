import * as SecureStore from "expo-secure-store";
import { randombytes_buf, ready, to_base64, from_base64, base64_variants } from "react-native-libsodium";

const DB_KEY = "giraffle.sqlcipher-key.v1";
const VAULT_KEYS = "giraffle.vault-keys.v1";
const VAULT_MARKER = "giraffle.vault-marker.v1";

export interface VaultKeys {
  vaultRootKey: Uint8Array;
  contentKey: Uint8Array;
  locatorKey: Uint8Array;
  signingSeed: Uint8Array;
  agreementSeed: Uint8Array;
}

const encoding = base64_variants.URLSAFE_NO_PADDING;
const encode = (bytes: Uint8Array) => to_base64(bytes, encoding);
const decode = (value: string) => from_base64(value, encoding);

export async function hasLocalVault(): Promise<boolean> { return (await SecureStore.getItemAsync(VAULT_MARKER)) === "1"; }
export async function createLocalKeys(): Promise<{ databaseKey: Uint8Array; vaultKeys: VaultKeys }> {
  await ready;
  const databaseKey = randombytes_buf(32);
  const vaultKeys = { vaultRootKey: randombytes_buf(32), contentKey: randombytes_buf(32), locatorKey: randombytes_buf(32), signingSeed: randombytes_buf(32), agreementSeed: randombytes_buf(32) };
  await SecureStore.setItemAsync(DB_KEY, encode(databaseKey), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(VAULT_KEYS, JSON.stringify(Object.fromEntries(Object.entries(vaultKeys).map(([key, value]) => [key, encode(value)]))), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(VAULT_MARKER, "1", { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return { databaseKey, vaultKeys };
}
/**
 * Rewrites the stored vault secrets. A device that joins an existing vault
 * generates its own identity seeds first and only learns the vault-wide keys
 * once a trusted device has sealed them to it.
 */
export async function saveVaultKeys(vaultKeys: VaultKeys): Promise<void> {
  await SecureStore.setItemAsync(VAULT_KEYS, JSON.stringify(Object.fromEntries(Object.entries(vaultKeys).map(([key, value]) => [key, encode(value)]))), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function loadLocalKeys(requireAuthentication = false): Promise<{ databaseKey: Uint8Array; vaultKeys: VaultKeys } | null> {
  await ready;
  const options: SecureStore.SecureStoreOptions = { requireAuthentication, authenticationPrompt: "Unlock Giraffle", keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const [db, raw] = await Promise.all([SecureStore.getItemAsync(DB_KEY, options), SecureStore.getItemAsync(VAULT_KEYS, options)]);
  if (!db || !raw) return null;
  const parsed = JSON.parse(raw) as Record<keyof VaultKeys, string>;
  return { databaseKey: decode(db), vaultKeys: { vaultRootKey: decode(parsed.vaultRootKey), contentKey: decode(parsed.contentKey), locatorKey: decode(parsed.locatorKey), signingSeed: decode(parsed.signingSeed), agreementSeed: decode(parsed.agreementSeed) } };
}
export async function clearLocalKeys(): Promise<void> { await Promise.all([DB_KEY, VAULT_KEYS, VAULT_MARKER].map((key) => SecureStore.deleteItemAsync(key))); }
export function clearKeyMaterial(keys: { databaseKey: Uint8Array; vaultKeys: VaultKeys }): void { keys.databaseKey.fill(0); Object.values(keys.vaultKeys).forEach((value) => value.fill(0)); }
export { encode as encodeKey, decode as decodeKey };
