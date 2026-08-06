import sqlite3InitModule, {
  type Database,
  type SqlValue,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import wasmUri from "@sqlite.org/sqlite-wasm/sqlite3.wasm";
import type { SqlBind, VaultDatabase } from "./vaultDatabase";

/** A SQLite database held entirely in memory, plus the bytes that reproduce it. */
export interface SqliteImage {
  database: VaultDatabase;
  serialize(): Uint8Array;
  /** A snapshot taken mid-transaction would capture uncommitted pages. */
  inTransaction(): boolean;
}

// The published declaration deliberately drops Emscripten's module argument
// (sqlite/sqlite-wasm#129), but Giraffle has to supply one: the WebAssembly
// binary is a Metro asset, so only the app knows the URL it was emitted under.
const initSqlite = sqlite3InitModule as unknown as (config: {
  locateFile: (path: string) => string;
  print: () => void;
  printErr: () => void;
}) => Promise<Sqlite3Static>;

let runtime: Promise<Sqlite3Static> | null = null;

function loadRuntime(): Promise<Sqlite3Static> {
  runtime ??= initSqlite({
    locateFile: () => wasmUri,
    print: () => undefined,
    // The build probes for OPFS-backed VFS variants Giraffle does not install
    // and narrates every miss; the vault image is sealed by this app instead.
    printErr: () => undefined,
  }).catch((cause: unknown) => {
    runtime = null;
    throw cause;
  });
  return runtime;
}

function bindable(params: SqlBind[]): SqlBind[] {
  return params.map((value) => (value === undefined ? null : value));
}

function rowsOf<T>(
  database: Database,
  sql: string,
  params: SqlBind[],
): T[] {
  const rows: Record<string, SqlValue>[] = [];
  database.exec({
    sql,
    bind: bindable(params),
    rowMode: "object",
    resultRows: rows,
  });
  // `rowMode: "object"` yields null-prototype rows; callers treat them as plain
  // records, so they are copied onto ordinary objects here.
  return rows.map((row) => ({ ...row })) as T[];
}

/**
 * Runs SQLite in WebAssembly with no file backing at all. Persistence is not
 * this layer's business: the caller seals `serialize()` and stores the
 * ciphertext, which is the only reason a browser vault can hold the same
 * schema as the device without SQLCipher.
 */
export async function openSqliteImage(
  image: Uint8Array | null,
): Promise<SqliteImage> {
  const sqlite3 = await loadRuntime();
  const database = new sqlite3.oo1.DB(":memory:", "c");

  if (image && image.length > 0) {
    const pointer = sqlite3.wasm.allocFromTypedArray(image);
    const result = sqlite3.capi.sqlite3_deserialize(
      database,
      "main",
      pointer,
      image.length,
      image.length,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
        sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    if (result !== sqlite3.capi.SQLITE_OK) {
      database.close();
      throw new Error("The stored vault database could not be reopened.");
    }
  }

  return {
    serialize: () => sqlite3.capi.sqlite3_js_db_export(database),
    inTransaction: () => sqlite3.capi.sqlite3_get_autocommit(database) === 0,
    database: {
      async execAsync(sql) {
        database.exec(sql);
      },
      async runAsync(sql, ...params) {
        database.exec({ sql, bind: bindable(params) });
        return {
          changes: sqlite3.capi.sqlite3_changes(database),
          lastInsertRowId: Number(
            sqlite3.capi.sqlite3_last_insert_rowid(database),
          ),
        };
      },
      async getFirstAsync<T>(sql: string, ...params: SqlBind[]) {
        return rowsOf<T>(database, sql, params)[0] ?? null;
      },
      async getAllAsync<T>(sql: string, ...params: SqlBind[]) {
        return rowsOf<T>(database, sql, params);
      },
      async closeAsync() {
        database.close();
      },
    },
  };
}
