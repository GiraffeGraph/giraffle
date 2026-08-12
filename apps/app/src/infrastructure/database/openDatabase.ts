import * as SQLite from "expo-sqlite";
import { initializeSchema, repairPagePositions, type VaultDatabase } from "./vaultDatabase";

const DATABASE_NAME = "giraffle-vault.db";

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function openEncryptedDatabase(
  key: Uint8Array,
): Promise<VaultDatabase> {
  // Expo's Android close path can double-finalize cached SQLCipher statements on
  // Android 10 and crash natively. Our query helpers finalize every statement,
  // so skip the unsafe catch-all pass and let sqlite3_close verify that cleanly.
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME, {
    finalizeUnusedStatementsBeforeClosing: false,
  });

  try {
    await database.execAsync(`PRAGMA key = '${hex(key)}';`);
    const cipher = await database.getFirstAsync<{ cipher_version: string }>(
      "PRAGMA cipher_version",
    );
    if (!cipher?.cipher_version) {
      throw new Error("Encrypted storage is unavailable.");
    }

    const runSetup = async (name: string, statement: string) => {
      try {
        await database.execAsync(statement);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Database setup failed at ${name}: ${message}`);
      }
    };
    await runSetup("foreign keys", "PRAGMA foreign_keys = ON");
    await runSetup("secure delete", "PRAGMA secure_delete = ON");
    await runSetup("memory security", "PRAGMA cipher_memory_security = ON");
    await runSetup("journal", "PRAGMA journal_mode = WAL");
    await database.getFirstAsync("SELECT count(*) AS count FROM sqlite_master");
    await initializeSchema(database);
    await repairPagePositions(database);
    return database;
  } catch (cause) {
    await database.closeAsync().catch(() => undefined);
    throw cause;
  }
}

export async function deleteEncryptedDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
}
