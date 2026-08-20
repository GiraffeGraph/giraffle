import { decodeCanonical, encodeCanonical } from "@giraffle/protocol";
import { openOriginByteStore } from "../storage/originByteStore";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import type { LocalKeys, VaultKeys } from "./vaultKeys.contract";

const SESSION_BLOB = "unlocked-session.v1";
const WRAP_DATABASE = "giraffle-session-wrap";
const WRAP_STORE = "keys";
const WRAP_KEY = "wrap.v1";

const EXPIRY_BYTES = 8;
const IV_BYTES = 12;
const KEY_NAMES = [
  "vaultRootKey",
  "contentKey",
  "locatorKey",
  "signingSeed",
  "agreementSeed",
] as const satisfies readonly (keyof VaultKeys)[];

/**
 * A reload throws away the tab's memory, which is what makes a locked tab
 * unreadable — and also what threw the person out every time they refreshed.
 * The lock timeout is the setting that says how long a vault may stay open, so
 * it governs a reload too: the key bundle is written here sealed under a key
 * the browser will not hand back, and read again only until the timeout ends.
 *
 * That wrapping key is non-extractable, so the sealed bundle is worthless on
 * its own — copying the profile's files off the disk does not carry the vault
 * with it. It does not, and cannot, protect against someone using this browser
 * on this machine before the timeout runs out: that is exactly what "stay
 * unlocked" means, and why the timeout is a choice rather than a default.
 */
function available(): boolean {
  return typeof indexedDB !== "undefined" && typeof crypto?.subtle?.encrypt === "function";
}

function openWrapDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WRAP_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WRAP_STORE)) {
        request.result.createObjectStore(WRAP_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Session store is unavailable"));
  });
}

function readWrapKey(database: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(WRAP_STORE, "readonly").objectStore(WRAP_STORE).get(WRAP_KEY);
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Session key is unreadable"));
  });
}

function writeWrapKey(database: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WRAP_STORE, "readwrite");
    transaction.objectStore(WRAP_STORE).put(key, WRAP_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Session key is unwritable"));
  });
}

function dropWrapKey(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WRAP_STORE, "readwrite");
    transaction.objectStore(WRAP_STORE).delete(WRAP_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Session key is stuck"));
  });
}

/** One key per browser profile, minted on first use and never exported. */
async function wrapKey(create: boolean): Promise<CryptoKey | null> {
  const database = await openWrapDatabase();
  try {
    const existing = await readWrapKey(database);
    if (existing || !create) return existing;

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await writeWrapKey(database, key);
    return key;
  } finally {
    database.close();
  }
}

function encodeExpiry(expiresAt: number): Uint8Array {
  const bytes = new Uint8Array(EXPIRY_BYTES);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(Math.max(0, Math.floor(expiresAt))));
  return bytes;
}

function decodeExpiry(bytes: Uint8Array): number {
  return Number(new DataView(bytes.buffer, bytes.byteOffset, EXPIRY_BYTES).getBigUint64(0));
}

export async function rememberUnlockedSession(keys: LocalKeys, expiresAt: number): Promise<void> {
  if (!available()) return;

  const key = await wrapKey(true);
  if (!key) return;

  const plaintext = encodeCanonical({
    databaseKey: keys.databaseKey,
    vaultRootKey: keys.vaultKeys.vaultRootKey,
    contentKey: keys.vaultKeys.contentKey,
    locatorKey: keys.vaultKeys.locatorKey,
    signingSeed: keys.vaultKeys.signingSeed,
    agreementSeed: keys.vaultKeys.agreementSeed,
  });
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  // WebCrypto wants a plain ArrayBuffer, and the encoder hands back a view over
  // a pooled one, so the bytes are copied and the copy is wiped straight after.
  const staged = new Uint8Array(plaintext);

  try {
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, staged.buffer),
    );
    const record = new Uint8Array(EXPIRY_BYTES + IV_BYTES + sealed.length);
    record.set(encodeExpiry(expiresAt), 0);
    record.set(iv, EXPIRY_BYTES);
    record.set(sealed, EXPIRY_BYTES + IV_BYTES);
    const store = await openOriginByteStore();
    await store.write(SESSION_BLOB, record);
  } finally {
    staged.fill(0);
    vaultCryptoProvider.clear(plaintext);
  }
}

export async function restoreUnlockedSession(): Promise<LocalKeys | null> {
  if (!available()) return null;

  const store = await openOriginByteStore();
  const record = await store.read(SESSION_BLOB);
  if (!record || record.length <= EXPIRY_BYTES + IV_BYTES) return null;

  if (Date.now() >= decodeExpiry(record)) {
    await forgetUnlockedSession();
    return null;
  }

  const key = await wrapKey(false);
  if (!key) return null;

  const iv = new Uint8Array(record.subarray(EXPIRY_BYTES, EXPIRY_BYTES + IV_BYTES));
  const sealed = new Uint8Array(record.subarray(EXPIRY_BYTES + IV_BYTES));

  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed.buffer),
    );
  } catch {
    await forgetUnlockedSession();
    return null;
  }

  try {
    const payload = decodeCanonical(plaintext) as Record<string, unknown>;
    const databaseKey = payload.databaseKey;
    if (!(databaseKey instanceof Uint8Array) || databaseKey.length !== 32) return null;

    const vaultKeys = {} as VaultKeys;
    for (const name of KEY_NAMES) {
      const value = payload[name];
      if (!(value instanceof Uint8Array) || value.length !== 32) return null;
      vaultKeys[name] = value.slice();
    }
    return { databaseKey: databaseKey.slice(), vaultKeys };
  } catch {
    return null;
  } finally {
    vaultCryptoProvider.clear(plaintext);
  }
}

/** Locking drops both halves, so nothing is left to reopen the vault with. */
export async function forgetUnlockedSession(): Promise<void> {
  if (!available()) return;

  const store = await openOriginByteStore();
  await store.remove(SESSION_BLOB).catch(() => undefined);

  const database = await openWrapDatabase();
  try {
    await dropWrapKey(database);
  } finally {
    database.close();
  }
}
