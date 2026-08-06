import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCK_TIMEOUT_KEY = "giraffle.lock-timeout.v1";
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// A preference, not a secret: AsyncStorage is backed by the app container on a
// device and by localStorage in a browser, and holds no key material either way.
export async function loadLockTimeout(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOCK_TIMEOUT_KEY);
  if (raw === null) return DEFAULT_LOCK_TIMEOUT_MS;
  if (raw === "never") return -1;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_LOCK_TIMEOUT_MS;
}

export async function saveLockTimeout(timeoutMs: number): Promise<void> {
  await AsyncStorage.setItem(
    LOCK_TIMEOUT_KEY,
    timeoutMs < 0 ? "never" : String(timeoutMs),
  );
}

export async function clearLockTimeout(): Promise<void> {
  await AsyncStorage.removeItem(LOCK_TIMEOUT_KEY);
}
