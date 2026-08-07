import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_SCHEMA_VERSION, migrations } from "@/infrastructure/database/migrations";

const sql = migrations.map((migration) => migration.sql).join("\n");

const CANONICAL_TABLES = [
  "vault_metadata",
  "pages",
  "blocks",
  "links",
  "task_metadata",
  "board_statuses",
  "boards",
  "board_columns",
  "board_tasks",
  "canvases",
  "canvas_references",
  "media_manifests",
];

const SYNC_TABLES = [
  "local_operations",
  "encrypted_outbox",
  "applied_operations",
  "sync_cursors",
  "trusted_devices",
  "encrypted_checkpoints",
];

describe("SQLCipher schema", () => {
  test("every committed schema version has exactly one ordered migration", () => {
    expect(migrations.map((migration) => migration.version)).toEqual(
      Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1),
    );
    expect(new Set(migrations.map((migration) => migration.name)).size).toBe(migrations.length);
  });

  test("declares the canonical and sync storage boundaries", () => {
    for (const table of [...CANONICAL_TABLES, ...SYNC_TABLES]) {
      expect(sql).toContain(`TABLE ${table}`);
    }
  });

  test("search is a derived index, rebuilt rather than synced", () => {
    expect(sql).toContain("VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5");
    expect(sql).toContain("page_id UNINDEXED");
    expect(SYNC_TABLES).not.toContain("page_fts");
  });

  test("outbound records are stored as ciphertext blobs only", () => {
    expect(sql).toContain("record BLOB NOT NULL");
    expect(sql).toContain("record_hash BLOB NOT NULL");
    expect(sql).toContain("ciphertext BLOB NOT NULL");
    expect(sql).toContain("losing_value_ciphertext BLOB NOT NULL");
  });

  test("deleting a page takes its blocks, links and canvas references with it", () => {
    for (const clause of [
      "parent_page_id TEXT REFERENCES pages(id) ON DELETE CASCADE",
      "page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE",
      "source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE",
    ]) {
      expect(sql).toContain(clause);
    }
  });

  test("an unresolved wikilink is kept, not dropped, when its target disappears", () => {
    expect(sql).toContain("target_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL");
    expect(sql).toContain("UNIQUE(source_page_id, source_block_id, target_raw)");
  });

  test("the ordering and lookup paths the repository relies on are indexed", () => {
    for (const index of [
      "idx_pages_parent_position",
      "idx_blocks_page_position",
      "idx_tasks_due",
      "idx_board_tasks_position",
      "idx_links_target",
      "idx_canvas_refs_page",
      "idx_outbox_retry",
    ]) {
      expect(sql).toContain(index);
    }
  });

  test("enforces foreign keys and confirms the cipher at database open", () => {
    const source = readFileSync(
      join(process.cwd(), "src/infrastructure/database/openDatabase.ts"),
      "utf8",
    );

    expect(source).toContain("PRAGMA foreign_keys = ON");
    expect(source).toContain("PRAGMA cipher_version");
  });
});
