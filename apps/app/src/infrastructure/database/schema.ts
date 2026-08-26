export const schemaSql = `
CREATE TABLE vault_metadata(
  id TEXT PRIMARY KEY,
  protocol_version INTEGER NOT NULL,
  active_key_epoch INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  device_sequence INTEGER NOT NULL DEFAULT 0,
  chain_head BLOB NOT NULL,
  clock_physical_ms INTEGER NOT NULL DEFAULT 0,
  clock_logical INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE page_states(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  family TEXT NOT NULL CHECK(family IN ('forever','open','done')),
  color TEXT,
  icon TEXT,
  position_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_page_states_default_family ON page_states(family) WHERE is_default=1 AND deleted=0;
INSERT INTO page_states(id,title,family,position_id,is_default,created_at,updated_at) VALUES
  ('giraffle-state-forever','Forever','forever','a0',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000),
  ('giraffle-state-open','Open','open','a1',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000),
  ('giraffle-state-done','Done','done','a2',1,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
CREATE TABLE pages(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT,
  parent_page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL,
  state_id TEXT NOT NULL REFERENCES page_states(id) ON DELETE RESTRICT DEFAULT 'giraffle-state-forever',
  category_id TEXT REFERENCES page_categories(id) ON DELETE SET NULL,
  priority TEXT,
  scheduled_at TEXT,
  duration_minutes INTEGER,
  calendar_color TEXT,
  description TEXT,
  child_view TEXT NOT NULL DEFAULT 'list',
  system_role TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE page_categories(
  id TEXT PRIMARY KEY,
  parent_page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT,
  position_id TEXT NOT NULL,
  state_id_on_enter TEXT REFERENCES page_states(id) ON DELETE SET NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_page_categories_parent_position ON page_categories(parent_page_id, position_id);
CREATE TABLE blocks(
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  attributes_json TEXT NOT NULL,
  position_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE links(
  id TEXT PRIMARY KEY,
  source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  source_block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
  target_raw TEXT NOT NULL,
  target_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  UNIQUE(source_page_id, source_block_id, target_raw)
);
CREATE TABLE page_documents(page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE, yjs_state BLOB NOT NULL, updated_at INTEGER NOT NULL);
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
CREATE TABLE object_registers(object_id TEXT NOT NULL, field TEXT NOT NULL, physical_ms INTEGER NOT NULL, logical INTEGER NOT NULL, device_id TEXT NOT NULL, operation_id TEXT NOT NULL, PRIMARY KEY(object_id, field));
CREATE TABLE deferred_records(record_id TEXT PRIMARY KEY, server_seq INTEGER NOT NULL, key_epoch INTEGER NOT NULL, record BLOB NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE VIRTUAL TABLE page_fts USING fts5(page_id UNINDEXED, title, body, tokenize='unicode61');
CREATE INDEX idx_pages_parent_position ON pages(parent_page_id, position_id);
CREATE INDEX idx_pages_state ON pages(state_id, is_archived, deleted);
CREATE INDEX idx_pages_priority ON pages(priority, is_archived, deleted);
CREATE INDEX idx_pages_scheduled ON pages(scheduled_at, is_archived, deleted);
CREATE INDEX idx_blocks_page_position ON blocks(page_id, position_id);
CREATE INDEX idx_blocks_page_live ON blocks(page_id, deleted);
CREATE INDEX idx_links_target ON links(target_page_id);
CREATE INDEX idx_canvas_refs_page ON canvas_references(page_id);
CREATE INDEX idx_outbox_retry ON encrypted_outbox(next_attempt_at);
CREATE INDEX idx_deferred_seq ON deferred_records(server_seq);
`;
