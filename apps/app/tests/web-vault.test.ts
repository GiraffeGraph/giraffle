import "fake-indexeddb/auto";

import {
  deleteEncryptedDatabase,
  openEncryptedDatabase,
} from "@/infrastructure/database/openDatabase.web";
import {
  clearKeyMaterial,
  clearLocalKeys,
  createLocalKeys,
  createPassphraseWrapper,
  createQuickPin,
  hasLocalVault,
  hasQuickPin,
  hasVaultWrapper,
  sessionVaultKeys,
  unlockLocalKeys,
} from "@/infrastructure/secure-storage/vaultKeys.web";
import { openOriginByteStore } from "@/infrastructure/storage/originByteStore";
import { initializeCrypto } from "@/sync/cryptoProvider.web";

// The browser modules are named explicitly because Jest resolves the app's
// imports to the native platform. Both substitutions below keep the subject
// under test the web code: its crypto provider, and an in-process SQLite that
// stands in for the WebAssembly engine. Babel hoists them above every import.
jest.mock("@/sync/cryptoProvider", () =>
  jest.requireActual("@/sync/cryptoProvider.web"),
);
jest.mock("@/infrastructure/database/sqliteWasm", () =>
  jest.requireActual("./support/webSqlite"),
);

const VAULT_ID = "00000000-0000-4000-8000-000000000001";
const PASSPHRASE = "correct-horse-battery-staple";
const PIN = "4071";
const CANARY = "Zanzibar plaintext canary";

const IMAGE_NAME = "vault-image.v1";
const SQLITE_HEADER = "SQLite format 3";

// The sealed image is hundreds of kilobytes, so it is decoded byte-for-byte
// rather than spread through String.fromCharCode.
function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

async function storedBytes(name: string): Promise<Uint8Array | null> {
  const store = await openOriginByteStore();
  return store.read(name);
}

/** Everything the app needs to reopen a vault, as a browser would after a reload. */
async function createVault() {
  const keys = await createLocalKeys();
  await createPassphraseWrapper(VAULT_ID, PASSPHRASE, keys.vaultKeys.vaultRootKey);
  await createQuickPin(VAULT_ID, PIN, keys.vaultKeys.vaultRootKey);
  return keys;
}

/** Drops every trace of the open vault from memory, as locking the tab does. */
function lock(keys: Awaited<ReturnType<typeof createLocalKeys>>) {
  clearKeyMaterial(keys);
}

describe("web vault storage", () => {
  beforeAll(async () => {
    await initializeCrypto();
  });

  afterEach(async () => {
    await deleteEncryptedDatabase();
    await clearLocalKeys();
  });

  test("falls back to IndexedDB when the origin private file system is absent", async () => {
    const store = await openOriginByteStore();

    expect(store.backend).toBe("indexeddb");
    await store.write("probe", Uint8Array.from([1, 2, 3]));
    expect(await store.read("probe")).toEqual(Uint8Array.from([1, 2, 3]));
    await store.remove("probe");
    expect(await store.read("probe")).toBeNull();
  });

  test("a new vault leaves no key material readable in storage", async () => {
    const keys = await createVault();

    expect(await hasLocalVault()).toBe(true);
    expect(await hasVaultWrapper()).toBe(true);
    expect(await hasQuickPin()).toBe(true);

    const bundle = await storedBytes("vault-keys.v1");
    expect(bundle).not.toBeNull();
    const stored = latin1(bundle as Uint8Array);
    for (const secret of Object.values(keys.vaultKeys)) {
      expect(stored).not.toContain(latin1(secret));
    }
    expect(stored).not.toContain(latin1(keys.databaseKey));
  });

  test("the passphrase reproduces the very same keys after a reload", async () => {
    const created = await createVault();
    const expected = {
      databaseKey: Uint8Array.from(created.databaseKey),
      vaultRootKey: Uint8Array.from(created.vaultKeys.vaultRootKey),
      contentKey: Uint8Array.from(created.vaultKeys.contentKey),
    };
    lock(created);

    const reopened = await unlockLocalKeys(PASSPHRASE, "passphrase");

    expect(reopened).not.toBeNull();
    expect(reopened?.databaseKey).toEqual(expected.databaseKey);
    expect(reopened?.vaultKeys.vaultRootKey).toEqual(expected.vaultRootKey);
    expect(reopened?.vaultKeys.contentKey).toEqual(expected.contentKey);
  });

  test("the quick PIN opens the same vault as the passphrase", async () => {
    const created = await createVault();
    const expected = Uint8Array.from(created.vaultKeys.vaultRootKey);
    lock(created);

    const reopened = await unlockLocalKeys(PIN, "pin");

    expect(reopened?.vaultKeys.vaultRootKey).toEqual(expected);
  });

  test("a wrong credential yields no keys at all", async () => {
    const created = await createVault();
    lock(created);

    expect(await unlockLocalKeys("not-the-passphrase", "passphrase")).toBeNull();
    expect(await unlockLocalKeys("9999", "pin")).toBeNull();
    expect(await unlockLocalKeys("abc", "pin")).toBeNull();
    expect(sessionVaultKeys()).toBeNull();
  });

  test("a page written on one connection is read back on the next", async () => {
    const keys = await createVault();
    const databaseKey = Uint8Array.from(keys.databaseKey);

    const database = await openEncryptedDatabase(databaseKey);
    await database.runAsync(
      "INSERT INTO pages(id,title,parent_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      "page-1",
      CANARY,
      null,
      "a0",
      1,
      1,
    );
    await database.closeAsync();

    const reopened = await openEncryptedDatabase(databaseKey);
    const row = await reopened.getFirstAsync<{ title: string }>(
      "SELECT title FROM pages WHERE id=?",
      "page-1",
    );
    await reopened.closeAsync();

    expect(row?.title).toBe(CANARY);
  });

  test("what reaches storage is ciphertext, never the database itself", async () => {
    const keys = await createVault();
    const databaseKey = Uint8Array.from(keys.databaseKey);

    const database = await openEncryptedDatabase(databaseKey);
    await database.runAsync(
      "INSERT INTO pages(id,title,parent_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      "page-1",
      CANARY,
      null,
      "a0",
      1,
      1,
    );
    await database.closeAsync();

    const sealed = await storedBytes(IMAGE_NAME);
    expect(sealed).not.toBeNull();
    const stored = latin1(sealed as Uint8Array);

    expect(stored).not.toContain(CANARY);
    expect(stored).not.toContain(SQLITE_HEADER);
    expect(stored).not.toContain("page_documents");
  });

  test("a locked vault yields nothing readable", async () => {
    const keys = await createVault();
    const databaseKey = Uint8Array.from(keys.databaseKey);

    const database = await openEncryptedDatabase(databaseKey);
    await database.runAsync(
      "INSERT INTO pages(id,title,parent_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      "page-1",
      CANARY,
      null,
      "a0",
      1,
      1,
    );
    await database.closeAsync();
    lock(keys);

    expect(sessionVaultKeys()).toBeNull();
    await expect(
      openEncryptedDatabase(new Uint8Array(32).fill(7)),
    ).rejects.toThrow();
  });

  test("the schema the device uses is the schema the browser migrates to", async () => {
    const keys = await createVault();
    const database = await openEncryptedDatabase(Uint8Array.from(keys.databaseKey));

    const applied = await database.getAllAsync<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    const search = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='page_fts'",
    );
    await database.closeAsync();

    expect(applied.map((row) => row.version)).toEqual([1, 2, 3, 4]);
    expect(search?.name).toBe("page_fts");
  });
});
