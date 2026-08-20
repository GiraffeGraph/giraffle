import type { LocalKeys } from "./vaultKeys.contract";

/**
 * A native app keeps its keys in the Keychain or the Keystore and its process
 * across a screen lock, so there is no reload to survive. The web build has a
 * real implementation; this one exists so callers need no platform branch.
 */
export async function rememberUnlockedSession(_keys: LocalKeys, _expiresAt: number): Promise<void> {
  return;
}

export async function restoreUnlockedSession(): Promise<LocalKeys | null> {
  return null;
}

export async function forgetUnlockedSession(): Promise<void> {
  return;
}
