import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteImage } from "@/infrastructure/database/sqliteWasm";
import type { SqlBind } from "@/infrastructure/database/vaultDatabase";

const TRANSACTION_START = /^\s*BEGIN\b/i;
const TRANSACTION_END = /^\s*(COMMIT|ROLLBACK|END)\b/i;

function coerce(params: SqlBind[]): SqlBind[] {
  return params.map((value) => (value === undefined ? null : value));
}

/**
 * Stands in for the WebAssembly engine so the browser storage layer can be
 * tested on Node. It has the same contract — an in-process SQLite whose whole
 * image can be handed over as bytes — which is all `openDatabase.web` depends
 * on; the WebAssembly build itself is exercised in a browser instead.
 */
export async function openSqliteImage(
  image: Uint8Array | null,
): Promise<SqliteImage> {
  const directory = mkdtempSync(join(tmpdir(), "giraffle-web-vault-"));
  const path = join(directory, "vault.db");
  if (image && image.length > 0) writeFileSync(path, image);

  const database = new DatabaseSync(path);
  let depth = 0;

  return {
    serialize: () => new Uint8Array(readFileSync(path)),
    inTransaction: () => depth > 0,
    database: {
      async execAsync(sql) {
        database.exec(sql);
        if (TRANSACTION_START.test(sql)) depth += 1;
        else if (TRANSACTION_END.test(sql)) depth = Math.max(0, depth - 1);
      },
      async runAsync(sql, ...params) {
        const result = database.prepare(sql).run(...coerce(params));
        return {
          changes: Number(result.changes),
          lastInsertRowId: Number(result.lastInsertRowid),
        };
      },
      async getFirstAsync<T>(sql: string, ...params: SqlBind[]) {
        return (database.prepare(sql).get(...coerce(params)) as T | undefined) ?? null;
      },
      async getAllAsync<T>(sql: string, ...params: SqlBind[]) {
        return database.prepare(sql).all(...coerce(params)) as T[];
      },
      async closeAsync() {
        database.close();
        rmSync(directory, { recursive: true, force: true });
      },
    },
  };
}
