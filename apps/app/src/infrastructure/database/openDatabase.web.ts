import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import { openOriginByteStore } from "../storage/originByteStore";
import { openSqliteImage } from "./sqliteWasm";
import { repairPagePositions, runMigrations, type VaultDatabase } from "./vaultDatabase";

const IMAGE_NAME = "vault-image.v1";
const NONCE_BYTES = 24;
const FLUSH_DELAY_MS = 250;

// Binds the framing to this suite so a blob produced by some other version of
// the app cannot be fed back in as a vault image.
const IMAGE_AAD = new TextEncoder().encode(
  "giraffle-web-vault-image/1/xchacha20poly1305",
);

function seal(image: Uint8Array, key: Uint8Array): Uint8Array {
  const nonce = vaultCryptoProvider.randomBytes(NONCE_BYTES);
  const { ciphertext } = vaultCryptoProvider.encrypt({
    plaintext: image,
    additionalData: IMAGE_AAD,
    key,
    nonce,
  });
  const sealed = new Uint8Array(nonce.length + ciphertext.length);
  sealed.set(nonce, 0);
  sealed.set(ciphertext, nonce.length);
  return sealed;
}

function open(sealed: Uint8Array, key: Uint8Array): Uint8Array {
  if (sealed.length <= NONCE_BYTES) {
    throw new Error("The stored vault database is truncated.");
  }
  return vaultCryptoProvider.decrypt({
    ciphertext: sealed.subarray(NONCE_BYTES),
    additionalData: IMAGE_AAD,
    key,
    nonce: sealed.subarray(0, NONCE_BYTES),
  });
}

/**
 * A browser has no SQLCipher, so the database is not encrypted page by page —
 * it is held in memory and its whole image is sealed with XChaCha20-Poly1305
 * before it ever reaches storage. What sits at rest is one authenticated
 * ciphertext, and it is unreadable until the vault key is derived again.
 */
export async function openEncryptedDatabase(
  key: Uint8Array,
): Promise<VaultDatabase> {
  const store = await openOriginByteStore();
  const sealed = await store.read(IMAGE_NAME);
  const engine = await openSqliteImage(sealed ? open(sealed, key) : null);

  // Retained for the life of the connection: every flush re-seals the image,
  // and the caller wipes its own copy of the key as soon as the vault locks.
  const imageKey = key.slice();

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> = Promise.resolve();
  let closed = false;

  const writeNow = async (): Promise<void> => {
    if (closed || engine.inTransaction()) return;
    const image = engine.serialize();
    try {
      await store.write(IMAGE_NAME, seal(image, imageKey));
    } finally {
      vaultCryptoProvider.clear(image);
    }
  };

  const flush = (): Promise<void> => {
    flushing = flushing.then(writeNow, writeNow);
    return flushing;
  };

  const scheduleFlush = () => {
    if (closed || flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      // A statement that is still inside a transaction leaves the image
      // half-written, so the snapshot waits for the commit instead.
      if (engine.inTransaction()) {
        scheduleFlush();
        return;
      }
      void flush();
    }, FLUSH_DELAY_MS);
  };

  // Closing a tab does not run cleanup, so the last unwritten change is sealed
  // while the page is still alive. Prerendering and test hosts define a partial
  // `window` with no event target, so the listener is only attached for real.
  const observable =
    typeof window !== "undefined" && typeof window.addEventListener === "function";
  const onHide = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
  };
  if (observable) {
    window.addEventListener("pagehide", onHide);
    window.addEventListener("visibilitychange", onHide);
  }

  const database: VaultDatabase = {
    async execAsync(sql) {
      await engine.database.execAsync(sql);
      scheduleFlush();
    },
    async runAsync(sql, ...params) {
      const result = await engine.database.runAsync(sql, ...params);
      scheduleFlush();
      return result;
    },
    getFirstAsync: (sql, ...params) => engine.database.getFirstAsync(sql, ...params),
    getAllAsync: (sql, ...params) => engine.database.getAllAsync(sql, ...params),
    async closeAsync() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();
      closed = true;
      if (observable) {
        window.removeEventListener("pagehide", onHide);
        window.removeEventListener("visibilitychange", onHide);
      }
      vaultCryptoProvider.clear(imageKey);
      await engine.database.closeAsync();
    },
  };

  try {
    await database.execAsync("PRAGMA foreign_keys = ON");
    await runMigrations(database);
    await repairPagePositions(database);
    await flush();
    return database;
  } catch (cause) {
    await database.closeAsync().catch(() => undefined);
    throw cause;
  }
}

export async function deleteEncryptedDatabase(): Promise<void> {
  const store = await openOriginByteStore();
  await store.remove(IMAGE_NAME);
}
