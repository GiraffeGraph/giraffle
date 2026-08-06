/**
 * Every migration runs once, in order, inside a transaction. `user_version`
 * records how many have been applied so a restart is a no-op.
 *
 * Integer columns hold epoch milliseconds for timestamps and plain integers for
 * sequences; SQLite's 64-bit INTEGER covers both without a separate type.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE access_token (
    token_hash   TEXT PRIMARY KEY,
    vault_id     TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
  ) STRICT;

  CREATE TABLE vault (
    id               TEXT PRIMARY KEY,
    protocol_version INTEGER NOT NULL DEFAULT 1,
    created_at       INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE device (
    id                   TEXT PRIMARY KEY,
    vault_id             TEXT NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    signing_public_key   BLOB NOT NULL,
    agreement_public_key BLOB NOT NULL,
    status               TEXT NOT NULL DEFAULT 'active',
    authorized_at        INTEGER NOT NULL,
    revoked_at           INTEGER,
    last_ack_server_seq  INTEGER NOT NULL DEFAULT 0
  ) STRICT;

  CREATE INDEX device_vault_status ON device(vault_id, status);

  CREATE TABLE sync_record (
    server_seq           INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id             TEXT NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
    record_id            TEXT NOT NULL,
    device_id            TEXT NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
    device_seq           INTEGER NOT NULL,
    previous_record_hash BLOB NOT NULL,
    object_locator       BLOB NOT NULL,
    key_epoch            INTEGER NOT NULL,
    encoded_record       BLOB NOT NULL,
    record_hash          BLOB NOT NULL,
    received_at          INTEGER NOT NULL
  ) STRICT;

  CREATE UNIQUE INDEX sync_record_vault_record_id ON sync_record(vault_id, record_id);
  CREATE UNIQUE INDEX sync_record_vault_device_seq ON sync_record(vault_id, device_id, device_seq);
  CREATE INDEX sync_record_vault_server_seq ON sync_record(vault_id, server_seq);

  CREATE TABLE checkpoint (
    id                   TEXT PRIMARY KEY,
    vault_id             TEXT NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
    covers_server_seq    INTEGER NOT NULL,
    key_epoch            INTEGER NOT NULL,
    ciphertext           BLOB NOT NULL,
    signature            BLOB NOT NULL,
    created_by_device_id TEXT NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
    created_at           INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX checkpoint_vault_covers ON checkpoint(vault_id, covers_server_seq);
  `,
];
