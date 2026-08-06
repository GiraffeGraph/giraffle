import * as SQLite from "expo-sqlite";
import { repairPagePositions, runMigrations, type VaultDatabase } from "./vaultDatabase";

const DATABASE_NAME = "giraffle-vault.db";

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function openEncryptedDatabase(
  key: Uint8Array,
): Promise<VaultDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

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
    await runMigrations(database);
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
