import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { decode as decodeCbor, encode as encodeCbor } from "cborg";
import {
  decrypt,
  derivePassphraseKey,
  encrypt,
  randomBytes,
  zeroize,
} from "../crypto/nativeCrypto";
import { decodeKey, encodeKey } from "./keyStore";

const PIN_WRAPPER_KEY = "giraffle.quick-pin-wrapper.v1";
const LOCK_TIMEOUT_KEY = "giraffle.lock-timeout.v1";
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

interface StoredPinWrapper {
  version: 1;
  vaultId: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  operations: 2;
  memoryBytes: number;
}

function pinAad(wrapper: Pick<StoredPinWrapper, "vaultId" | "operations" | "memoryBytes">) {
  return encodeCbor({
    purpose: "giraffle-device-quick-pin",
    protocolVersion: 1,
    wrapperVersion: 1,
    vaultId: wrapper.vaultId,
    operations: wrapper.operations,
    memoryBytes: wrapper.memoryBytes,
  });
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function hasQuickPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_WRAPPER_KEY)) !== null;
}

export async function createQuickPin(
  vaultId: string,
  pin: string,
  vaultRootKey: Uint8Array,
): Promise<void> {
  if (!isValidPin(pin)) throw new Error("PIN must contain exactly 4 digits");

  const salt = randomBytes(16);
  const operations = 2 as const;
  const memoryBytes = 64 * 1024 * 1024;
  const key = await derivePassphraseKey(pin, salt, operations, memoryBytes);
  const payload = encodeCbor({ vaultId, protocolVersion: 1, vaultRootKey });
  const encrypted = encrypt(
    payload,
    pinAad({ vaultId, operations, memoryBytes }),
    key,
  );
  const wrapper: StoredPinWrapper = {
    version: 1,
    vaultId,
    salt: encodeKey(salt),
    nonce: encodeKey(encrypted.nonce),
    ciphertext: encodeKey(encrypted.ciphertext),
    operations,
    memoryBytes,
  };

  try {
    await SecureStore.setItemAsync(PIN_WRAPPER_KEY, JSON.stringify(wrapper), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } finally {
    zeroize(key, salt, payload);
  }
}

export async function verifyQuickPin(
  pin: string,
  expectedVaultRootKey: Uint8Array,
): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const raw = await SecureStore.getItemAsync(PIN_WRAPPER_KEY);
  if (!raw) return false;

  const wrapper = JSON.parse(raw) as StoredPinWrapper;
  const salt = decodeKey(wrapper.salt);
  const key = await derivePassphraseKey(
    pin,
    salt,
    wrapper.operations,
    wrapper.memoryBytes,
  );

  let opened: Uint8Array | null = null;
  try {
    opened = decrypt(
      decodeKey(wrapper.ciphertext),
      pinAad(wrapper),
      key,
      decodeKey(wrapper.nonce),
    );
    const decoded = decodeCbor(opened) as { vaultRootKey?: Uint8Array };
    return (
      decoded.vaultRootKey instanceof Uint8Array &&
      decoded.vaultRootKey.length === expectedVaultRootKey.length &&
      decoded.vaultRootKey.every(
        (byte, index) => byte === expectedVaultRootKey[index],
      )
    );
  } catch {
    return false;
  } finally {
    zeroize(key, salt);
    if (opened) zeroize(opened);
  }
}

export async function clearQuickPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_WRAPPER_KEY);
}

export async function loadLockTimeout(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOCK_TIMEOUT_KEY);
  if (raw === null) return DEFAULT_LOCK_TIMEOUT_MS;
  if (raw === "never") return -1;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_LOCK_TIMEOUT_MS;
}

export async function saveLockTimeout(timeoutMs: number): Promise<void> {
  if (timeoutMs < 0) {
    await AsyncStorage.setItem(LOCK_TIMEOUT_KEY, "never");
    return;
  }
  await AsyncStorage.setItem(LOCK_TIMEOUT_KEY, String(timeoutMs));
}

export async function clearAccessLockSettings(): Promise<void> {
  await Promise.all([
    clearQuickPin(),
    AsyncStorage.removeItem(LOCK_TIMEOUT_KEY),
  ]);
}
