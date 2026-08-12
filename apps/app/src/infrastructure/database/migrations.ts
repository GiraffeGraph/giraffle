export interface Migration { version: number; name: string; sql: string }

export const migrations: readonly Migration[] = [{
  version: 1,
  name: "encrypted-local-first-foundation",
  sql: `
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);
CREATE TABLE vault_metadata(id TEXT PRIMARY KEY, protocol_version INTEGER NOT NULL, active_key_epoch INTEGER NOT NULL, device_id TEXT NOT NULL, device_sequence INTEGER NOT NULL DEFAULT 0, chain_head BLOB NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE pages(id TEXT PRIMARY KEY, title TEXT NOT NULL, icon TEXT, parent_page_id TEXT REFERENCES pages(id) ON DELETE CASCADE, position_id TEXT NOT NULL, is_pinned INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE blocks(id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, parent_id TEXT REFERENCES blocks(id) ON DELETE CASCADE, type TEXT NOT NULL, content_json TEXT NOT NULL, attributes_json TEXT NOT NULL, position_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE links(id TEXT PRIMARY KEY, source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, source_block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE, target_raw TEXT NOT NULL, target_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL, UNIQUE(source_page_id, source_block_id, target_raw));
CREATE TABLE task_metadata(block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE, completed INTEGER NOT NULL DEFAULT 0, priority TEXT, due_date TEXT, duration_minutes INTEGER, description TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE board_statuses(id TEXT PRIMARY KEY, title TEXT NOT NULL, color TEXT, position_id TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE boards(id TEXT PRIMARY KEY, status_id TEXT REFERENCES board_statuses(id) ON DELETE SET NULL, title TEXT NOT NULL, icon TEXT, task_source_page_id TEXT NOT NULL UNIQUE REFERENCES pages(id) ON DELETE CASCADE, position_id TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE board_columns(id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, title TEXT NOT NULL, color TEXT, position_id TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE board_tasks(board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, block_id TEXT NOT NULL UNIQUE REFERENCES blocks(id) ON DELETE CASCADE, column_id TEXT NOT NULL REFERENCES board_columns(id), position_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(board_id, block_id));
CREATE TABLE canvases(id TEXT PRIMARY KEY, title TEXT NOT NULL, elements_json TEXT NOT NULL, app_state_json TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE canvas_references(canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE, element_id TEXT NOT NULL, page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, PRIMARY KEY(canvas_id, element_id));
CREATE TABLE media_manifests(id TEXT PRIMARY KEY, page_id TEXT REFERENCES pages(id) ON DELETE SET NULL, encrypted_path TEXT NOT NULL, wrapped_dek BLOB NOT NULL, encrypted_metadata BLOB NOT NULL, size_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE local_operations(record_id TEXT PRIMARY KEY, device_sequence INTEGER NOT NULL UNIQUE, record BLOB NOT NULL, record_hash BLOB NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE encrypted_outbox(record_id TEXT PRIMARY KEY REFERENCES local_operations(record_id) ON DELETE CASCADE, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT);
CREATE TABLE applied_operations(record_id TEXT PRIMARY KEY, server_seq INTEGER, applied_at INTEGER NOT NULL);
CREATE TABLE sync_cursors(vault_id TEXT PRIMARY KEY, server_seq INTEGER NOT NULL DEFAULT 0, last_success_at INTEGER, last_error TEXT);
CREATE TABLE trusted_devices(id TEXT PRIMARY KEY, name TEXT NOT NULL, signing_public_key BLOB NOT NULL, agreement_public_key BLOB NOT NULL, status TEXT NOT NULL, authorized_at INTEGER NOT NULL, revoked_at INTEGER, last_seen_at INTEGER);
CREATE TABLE encrypted_checkpoints(id TEXT PRIMARY KEY, covers_server_seq INTEGER NOT NULL, key_epoch INTEGER NOT NULL, ciphertext BLOB NOT NULL, signature BLOB NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE conflict_journal(id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, field_name TEXT NOT NULL, losing_value_ciphertext BLOB NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(page_id UNINDEXED, title, body, tokenize='unicode61');
CREATE INDEX idx_pages_parent_position ON pages(parent_page_id, position_id);
CREATE INDEX idx_blocks_page_position ON blocks(page_id, position_id);
CREATE INDEX idx_tasks_due ON task_metadata(due_date);
CREATE INDEX idx_boards_status_position ON boards(status_id, position_id);
CREATE INDEX idx_board_columns_position ON board_columns(board_id, position_id);
CREATE INDEX idx_board_tasks_position ON board_tasks(column_id, position_id);
CREATE INDEX idx_links_target ON links(target_page_id);
CREATE INDEX idx_canvas_refs_page ON canvas_references(page_id);
CREATE INDEX idx_outbox_retry ON encrypted_outbox(next_attempt_at);
`
}, {
  version: 2,
  name: "convergent-merge-state",
  sql: `
ALTER TABLE vault_metadata ADD COLUMN clock_physical_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vault_metadata ADD COLUMN clock_logical INTEGER NOT NULL DEFAULT 0;
ALTER TABLE blocks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE object_registers(object_id TEXT NOT NULL, field TEXT NOT NULL, physical_ms INTEGER NOT NULL, logical INTEGER NOT NULL, device_id TEXT NOT NULL, operation_id TEXT NOT NULL, PRIMARY KEY(object_id, field));
CREATE TABLE page_documents(page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE, yjs_state BLOB NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE deferred_records(record_id TEXT PRIMARY KEY, server_seq INTEGER NOT NULL, key_epoch INTEGER NOT NULL, record BLOB NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_blocks_page_live ON blocks(page_id, deleted);
CREATE INDEX idx_deferred_seq ON deferred_records(server_seq);
`
}, {
  version: 3,
  name: "task-lenses-and-visible-boards",
  sql: `
DROP TABLE IF EXISTS page_priorities;
UPDATE pages
SET title = (SELECT boards.title FROM boards WHERE boards.task_source_page_id = pages.id),
    icon = (SELECT boards.icon FROM boards WHERE boards.task_source_page_id = pages.id),
    is_archived = 0,
    updated_at = MAX(updated_at, COALESCE((SELECT boards.updated_at FROM boards WHERE boards.task_source_page_id = pages.id), updated_at))
WHERE id IN (SELECT task_source_page_id FROM boards WHERE deleted = 0);
DELETE FROM page_fts WHERE page_id IN (SELECT task_source_page_id FROM boards WHERE deleted = 0);
INSERT INTO page_fts(page_id,title,body)
SELECT p.id, p.title, '' FROM pages p JOIN boards b ON b.task_source_page_id=p.id WHERE b.deleted=0;
`
}, {
  version: 4,
  name: "canvas-task-references",
  sql: `
CREATE TABLE canvas_task_references(canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE, element_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE, PRIMARY KEY(canvas_id, element_id));
CREATE INDEX idx_canvas_task_refs_task ON canvas_task_references(task_id);
`
}, {
  version: 5,
  name: "enforce-board-column-ownership",
  sql: `
CREATE UNIQUE INDEX idx_board_columns_board_id_id ON board_columns(board_id, id);
CREATE TABLE board_tasks_v5(
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL UNIQUE REFERENCES blocks(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(board_id, block_id),
  FOREIGN KEY(board_id, column_id) REFERENCES board_columns(board_id, id)
);
INSERT INTO board_tasks_v5(board_id, block_id, column_id, position_id, created_at, updated_at)
SELECT bt.board_id, bt.block_id, bt.column_id, bt.position_id, bt.created_at, bt.updated_at
FROM board_tasks bt
JOIN board_columns c ON c.id = bt.column_id AND c.board_id = bt.board_id;
DROP TABLE board_tasks;
ALTER TABLE board_tasks_v5 RENAME TO board_tasks;
CREATE INDEX idx_board_tasks_position ON board_tasks(column_id, position_id);
`
}];

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;
