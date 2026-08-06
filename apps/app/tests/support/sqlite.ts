import { DatabaseSync } from "node:sqlite";

type Bind = null | number | string | Uint8Array;

/**
 * `expo-sqlite` is a native module, so the suite runs the very same SQL against
 * Node's bundled SQLite. Only the async surface the repository uses is provided;
 * anything else would be untested scaffolding.
 */
export interface TestDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Bind[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

const databases = new Map<string, TestDatabase>();

function coerce(params: Bind[]): Bind[] {
  return params.map((value) => (value === undefined ? null : value));
}

function wrap(database: DatabaseSync): TestDatabase {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, ...params) {
      const result = database.prepare(sql).run(...coerce(params));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getFirstAsync<T>(sql: string, ...params: Bind[]) {
      return (database.prepare(sql).get(...coerce(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: Bind[]) {
      return database.prepare(sql).all(...coerce(params)) as T[];
    },
    async closeAsync() {
      database.close();
    },
  };
}

export async function openDatabaseAsync(name: string): Promise<TestDatabase> {
  const existing = databases.get(name);
  if (existing) return existing;
  const database = wrap(new DatabaseSync(":memory:"));
  databases.set(name, database);
  return database;
}

export async function deleteDatabaseAsync(name: string): Promise<void> {
  await databases.get(name)?.closeAsync().catch(() => undefined);
  databases.delete(name);
}

export function resetTestDatabases(): void {
  for (const name of [...databases.keys()]) {
    void deleteDatabaseAsync(name);
  }
  databases.clear();
}
