import { positionBetween } from "@giraffle/domain";
import { schemaSql } from "./schema";

export type SqlBind = null | number | string | Uint8Array;

/** The SQLite surface shared by native, web, repository, and tests. */
export interface VaultDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlBind[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlBind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlBind[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

/** Creates the canonical schema once. Giraffle has no prior released vault format. */
export async function initializeSchema(database: VaultDatabase): Promise<void> {
  const existing = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='pages'",
  );
  if (existing?.count) return;
  await database.execAsync("BEGIN IMMEDIATE");
  try {
    await database.execAsync(schemaSql);
    await database.execAsync("COMMIT");
  } catch (cause) {
    await database.execAsync("ROLLBACK").catch(() => undefined);
    throw cause;
  }
}

/** Rewrites invalid fractional positions before a new sibling is inserted. */
export async function repairPagePositions(database: VaultDatabase): Promise<void> {
  const stale = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM pages WHERE position_id NOT GLOB '[A-Za-z]*'",
  );
  if (!stale?.count) return;
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
