import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./schema.ts";

export type SyncDatabase = Database.Database;

export function openDatabase(path: string): SyncDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const database = new Database(path);

  // WAL lets pull reads run while a push transaction holds the writer.
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");
  database.pragma("foreign_keys = ON");
  // Push serialises the whole batch behind BEGIN IMMEDIATE; a bounded wait
  // turns lock contention into a slow request instead of an instant failure.
  database.pragma("busy_timeout = 5000");

  migrate(database);
  return database;
}

function migrate(database: SyncDatabase) {
  const applied = Number(database.pragma("user_version", { simple: true }));

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    const statements = MIGRATIONS[version];
    if (!statements) continue;
    database.exec(`BEGIN; ${statements}; PRAGMA user_version = ${version + 1}; COMMIT;`);
  }
}
