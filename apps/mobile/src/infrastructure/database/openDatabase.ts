import * as SQLite from "expo-sqlite";
import { positionBetween } from "@/domain/ids";
import { migrations } from "./migrations";

const DATABASE_NAME = "giraffle-vault.db";

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function openEncryptedDatabase(
  key: Uint8Array,
): Promise<SQLite.SQLiteDatabase> {
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

/**
 * Sibling order is a fractional index, which only accepts keys starting with a
 * letter. Rewrites any page still carrying a numeric key so that generating the
 * next key cannot throw.
 */
export async function repairPagePositions(
  database: SQLite.SQLiteDatabase,
): Promise<void> {
  const stale = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM pages WHERE position_id NOT GLOB '[A-Za-z]*'",
  );

  if (!stale?.count) {
    return;
  }

  const rows = await database.getAllAsync<{ id: string; parent_page_id: string | null }>(
    "SELECT id, parent_page_id FROM pages ORDER BY parent_page_id, CAST(position_id AS REAL), id",
  );

  const lastByParent = new Map<string, string | null>();

  for (const row of rows) {
    const parentKey = row.parent_page_id ?? "";
    const next = positionBetween(lastByParent.get(parentKey) ?? null, null);
    lastByParent.set(parentKey, next);
    await database.runAsync("UPDATE pages SET position_id=? WHERE id=?", next, row.id);
  }
}

export async function deleteEncryptedDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
}

export async function runMigrations(
  database: SQLite.SQLiteDatabase,
): Promise<void> {
  await database.execAsync(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const current = await database.getFirstAsync<{ version: number }>(
    "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
  );

  for (const migration of migrations) {
    if (migration.version <= (current?.version ?? 0)) continue;
    await database.execAsync("BEGIN IMMEDIATE");
    try {
      await database.execAsync(migration.sql);
      await database.runAsync(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        migration.version,
        migration.name,
        Date.now(),
      );
      await database.execAsync("COMMIT");
    } catch (cause) {
      await database.execAsync("ROLLBACK").catch(() => undefined);
      throw cause;
    }
  }
}
