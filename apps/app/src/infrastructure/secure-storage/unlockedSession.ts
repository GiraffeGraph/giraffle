import * as SecureStore from "expo-secure-store";
import { decodeKey, encodeKey } from "./keyEncoding";
import type { LocalKeys, VaultKeys } from "./vaultKeys.contract";

const SESSION_KEY = "giraffle.unlocked-session.v1";
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const KEY_NAMES = [
  "vaultRootKey",
  "contentKey",
  "locatorKey",
  "signingSeed",
  "agreementSeed",
] as const satisfies readonly (keyof VaultKeys)[];

interface StoredSession {
  version: 1;
  expiresAt: number;
  databaseKey: string;
  vaultKeys: Record<keyof VaultKeys, string>;
}

/**
 * Native processes may be discarded while the app is in the background. Keep
 * a separate, revocable copy of the open key bundle in the device Keychain or
 * Keystore so the lock timeout still governs the next process launch.
 */
export async function rememberUnlockedSession(
  keys: LocalKeys,
  expiresAt: number,
): Promise<void> {
  const session: StoredSession = {
    version: 1,
    expiresAt,
    databaseKey: encodeKey(keys.databaseKey),
    vaultKeys: Object.fromEntries(
      KEY_NAMES.map((name) => [name, encodeKey(keys.vaultKeys[name])]),
    ) as Record<keyof VaultKeys, string>,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), KEYCHAIN);
}

export async function restoreUnlockedSession(): Promise<LocalKeys | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY, KEYCHAIN);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<StoredSession>;
    if (
      session.version !== 1 ||
      typeof session.expiresAt !== "number" ||
      !Number.isFinite(session.expiresAt) ||
      Date.now() >= session.expiresAt ||
      typeof session.databaseKey !== "string" ||
      !session.vaultKeys
    ) {
      await forgetUnlockedSession();
      return null;
    }

    const databaseKey = decodeKey(session.databaseKey);
    if (databaseKey.length !== 32) throw new Error("Invalid session database key");

    const vaultKeys = {} as VaultKeys;
    for (const name of KEY_NAMES) {
      const encoded = session.vaultKeys[name];
      if (typeof encoded !== "string") throw new Error("Invalid session vault key");
      const key = decodeKey(encoded);
      if (key.length !== 32) throw new Error("Invalid session vault key");
      vaultKeys[name] = key;
    }
    return { databaseKey, vaultKeys };
  } catch {
    await forgetUnlockedSession();
    return null;
  }
}

export async function forgetUnlockedSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
