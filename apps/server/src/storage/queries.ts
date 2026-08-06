import type { SyncDatabase } from "./database.ts";

export interface AccessTokenRow {
  tokenHash: string;
  vaultId: string;
}

export interface VaultRow {
  id: string;
  protocolVersion: number;
}

export interface DeviceRow {
  id: string;
  vaultId: string;
  name: string;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  status: string;
  revokedAt: number | null;
}

export interface DeviceHeadRow {
  deviceSeq: number;
  recordHash: Uint8Array;
}

export interface PulledRecordRow {
  serverSeq: number;
  encodedRecord: Uint8Array;
}

export interface InsertRecordInput {
  vaultId: string;
  recordId: string;
  deviceId: string;
  deviceSeq: number;
  previousRecordHash: Uint8Array;
  objectLocator: Uint8Array;
  keyEpoch: number;
  encodedRecord: Uint8Array;
  recordHash: Uint8Array;
}

export interface EnrollDeviceInput {
  vaultId: string;
  deviceId: string;
  name: string;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
}

export type Store = ReturnType<typeof createStore>;

export function createStore(database: SyncDatabase) {
  const statements = {
    deleteTokens: database.prepare("DELETE FROM access_token"),
    insertToken: database.prepare(
      "INSERT INTO access_token (token_hash, vault_id, created_at) VALUES (?, ?, ?)",
    ),
    findToken: database.prepare(
      "SELECT token_hash AS tokenHash, vault_id AS vaultId FROM access_token WHERE token_hash = ?",
    ),
    touchToken: database.prepare(
      "UPDATE access_token SET last_used_at = ? WHERE token_hash = ?",
    ),
    findVault: database.prepare(
      "SELECT id, protocol_version AS protocolVersion FROM vault WHERE id = ?",
    ),
    insertVault: database.prepare(
      "INSERT INTO vault (id, protocol_version, created_at) VALUES (?, 1, ?) ON CONFLICT(id) DO NOTHING",
    ),
    countActiveDevices: database.prepare(
      "SELECT COUNT(*) AS total FROM device WHERE vault_id = ? AND status = 'active'",
    ),
    findDevice: database.prepare(
      `SELECT id, vault_id AS vaultId, name,
              signing_public_key AS signingPublicKey,
              agreement_public_key AS agreementPublicKey,
              status, revoked_at AS revokedAt
       FROM device WHERE id = ?`,
    ),
    insertDevice: database.prepare(
      `INSERT INTO device (id, vault_id, name, signing_public_key, agreement_public_key, status, authorized_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    ),
    findRecordByRecordId: database.prepare(
      "SELECT encoded_record AS encodedRecord FROM sync_record WHERE vault_id = ? AND record_id = ?",
    ),
    findDeviceHead: database.prepare(
      `SELECT device_seq AS deviceSeq, record_hash AS recordHash
       FROM sync_record WHERE vault_id = ? AND device_id = ?
       ORDER BY device_seq DESC LIMIT 1`,
    ),
    insertRecord: database.prepare(
      `INSERT INTO sync_record
         (vault_id, record_id, device_id, device_seq, previous_record_hash,
          object_locator, key_epoch, encoded_record, record_hash, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    listRecords: database.prepare(
      `SELECT server_seq AS serverSeq, encoded_record AS encodedRecord
       FROM sync_record WHERE vault_id = ? AND server_seq > ?
       ORDER BY server_seq ASC LIMIT ?`,
    ),
  };

  return {
    /** Configured tokens are the whole truth: dropping one from config revokes it. */
    replaceAccessTokens(entries: readonly AccessTokenRow[]) {
      const now = Date.now();
      database.transaction(() => {
        statements.deleteTokens.run();
        for (const entry of entries) {
          statements.insertToken.run(entry.tokenHash, entry.vaultId, now);
        }
      })();
    },

    findAccessToken(tokenHash: string): AccessTokenRow | undefined {
      return statements.findToken.get(tokenHash) as AccessTokenRow | undefined;
    },

    touchAccessToken(tokenHash: string) {
      statements.touchToken.run(Date.now(), tokenHash);
    },

    findVault(vaultId: string): VaultRow | undefined {
      return statements.findVault.get(vaultId) as VaultRow | undefined;
    },

    countActiveDevices(vaultId: string): number {
      return (statements.countActiveDevices.get(vaultId) as { total: number }).total;
    },

    findDevice(deviceId: string): DeviceRow | undefined {
      return statements.findDevice.get(deviceId) as DeviceRow | undefined;
    },

    /** Bootstraps a vault and its first device as one unit. */
    enrollFirstDevice(input: EnrollDeviceInput) {
      const now = Date.now();
      database.transaction(() => {
        statements.insertVault.run(input.vaultId, now);
        statements.insertDevice.run(
          input.deviceId,
          input.vaultId,
          input.name,
          Buffer.from(input.signingPublicKey),
          Buffer.from(input.agreementPublicKey),
          now,
        );
      }).immediate();
    },

    findRecordByRecordId(vaultId: string, recordId: string): Uint8Array | undefined {
      const row = statements.findRecordByRecordId.get(vaultId, recordId) as
        | { encodedRecord: Uint8Array }
        | undefined;
      return row?.encodedRecord;
    },

    findDeviceHead(vaultId: string, deviceId: string): DeviceHeadRow | undefined {
      return statements.findDeviceHead.get(vaultId, deviceId) as DeviceHeadRow | undefined;
    },

    insertRecord(input: InsertRecordInput) {
      statements.insertRecord.run(
        input.vaultId,
        input.recordId,
        input.deviceId,
        input.deviceSeq,
        Buffer.from(input.previousRecordHash),
        Buffer.from(input.objectLocator),
        input.keyEpoch,
        Buffer.from(input.encodedRecord),
        Buffer.from(input.recordHash),
        Date.now(),
      );
    },

    listRecords(vaultId: string, after: number, limit: number): PulledRecordRow[] {
      return statements.listRecords.all(vaultId, after, limit) as PulledRecordRow[];
    },

    /** Runs a push batch as one unit so a rejected record leaves nothing behind. */
    inTransaction<T>(work: () => T): T {
      return database.transaction(work).immediate();
    },

    isReady(): boolean {
      return database.prepare("SELECT 1 AS ok").get() !== undefined;
    },

    close() {
      database.close();
    },
  };
}
