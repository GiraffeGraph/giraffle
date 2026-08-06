import { positionBetween } from "@giraffle/domain";
import { migrations } from "./migrations";

export type SqlBind = null | number | string | Uint8Array;

/**
 * The slice of SQLite every caller in the app actually uses. `SQLiteDatabase`
 * from expo-sqlite satisfies it structurally on a device, and the browser
 * engine implements it directly, so the repository, the migrations and the
 * tests all run against one type.
 */
export interface VaultDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: SqlBind[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlBind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlBind[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

export async function runMigrations(database: VaultDatabase): Promise<void> {
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

/**
 * Sibling order is a fractional index, which only accepts keys starting with a
 * letter. Rewrites any page still carrying a numeric key so that generating the
 * next key cannot throw.
 */
export async function repairPagePositions(database: VaultDatabase): Promise<void> {
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
