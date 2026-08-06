import type { SyncDatabase } from "./database.ts";

export interface AccessTokenRow {
  tokenHash: string;
  vaultId: string;
}

export interface VaultRow {
  id: string;
  protocolVersion: number;
}

export type DeviceStatus = "pending" | "active" | "revoked";

export interface DeviceRow {
  id: string;
  vaultId: string;
  name: string;
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  status: string;
  authorizedAt: number;
  approvedAt: number | null;
  approvedByDeviceId: string | null;
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

export interface RecordAuthorizationInput {
  statementHash: Uint8Array;
  vaultId: string;
  actingDeviceId: string;
  subjectDeviceId: string;
  action: string;
  issuedAt: number;
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
    findDevice: database.prepare(
      `SELECT id, vault_id AS vaultId, name,
              signing_public_key AS signingPublicKey,
              agreement_public_key AS agreementPublicKey,
              status, authorized_at AS authorizedAt, approved_at AS approvedAt,
              approved_by_device_id AS approvedByDeviceId, revoked_at AS revokedAt
       FROM device WHERE id = ?`,
    ),
    listDevices: database.prepare(
      `SELECT id, vault_id AS vaultId, name,
              signing_public_key AS signingPublicKey,
              agreement_public_key AS agreementPublicKey,
              status, authorized_at AS authorizedAt, approved_at AS approvedAt,
              approved_by_device_id AS approvedByDeviceId, revoked_at AS revokedAt
       FROM device WHERE vault_id = ? ORDER BY authorized_at, id`,
    ),
    insertDevice: database.prepare(
      `INSERT INTO device (id, vault_id, name, signing_public_key, agreement_public_key, status, authorized_at, approved_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    ),
    insertPendingDevice: database.prepare(
      `INSERT INTO device (id, vault_id, name, signing_public_key, agreement_public_key, status, authorized_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ),
    activateDevice: database.prepare(
      `UPDATE device SET status = 'active', approved_at = ?, approved_by_device_id = ?
       WHERE id = ? AND status = 'pending'`,
    ),
    revokeDevice: database.prepare(
      "UPDATE device SET status = 'revoked', revoked_at = ? WHERE id = ? AND status <> 'revoked'",
    ),
    upsertGrant: database.prepare(
      `INSERT INTO device_access_grant (device_id, vault_id, grant_blob, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET grant_blob = excluded.grant_blob, created_at = excluded.created_at`,
    ),
    findGrant: database.prepare(
      "SELECT grant_blob AS grantBlob FROM device_access_grant WHERE device_id = ?",
    ),
    deleteGrant: database.prepare("DELETE FROM device_access_grant WHERE device_id = ?"),
    findAuthorization: database.prepare(
      "SELECT 1 AS spent FROM device_authorization WHERE statement_hash = ?",
    ),
    insertAuthorization: database.prepare(
      `INSERT INTO device_authorization
         (statement_hash, vault_id, acting_device_id, subject_device_id, action, issued_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

    findDevice(deviceId: string): DeviceRow | undefined {
      return statements.findDevice.get(deviceId) as DeviceRow | undefined;
    },

    listDevices(vaultId: string): DeviceRow[] {
      return statements.listDevices.all(vaultId) as DeviceRow[];
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
          now,
        );
      }).immediate();
    },

    /**
     * A device joining an existing vault lands with no rights at all. It becomes
     * usable only once a trusted device signs an approval for exactly these keys.
     */
    enrollPendingDevice(input: EnrollDeviceInput) {
      statements.insertPendingDevice.run(
        input.deviceId,
        input.vaultId,
        input.name,
        Buffer.from(input.signingPublicKey),
        Buffer.from(input.agreementPublicKey),
        Date.now(),
      );
    },

    /**
     * Records the authorization and applies it as one unit. `false` means the
     * statement was already spent, so nothing changed.
     */
    applyAuthorization(
      input: RecordAuthorizationInput & { grant?: Uint8Array },
    ): boolean {
      const now = Date.now();
      return database.transaction(() => {
        try {
          statements.insertAuthorization.run(
            Buffer.from(input.statementHash),
            input.vaultId,
            input.actingDeviceId,
            input.subjectDeviceId,
            input.action,
            input.issuedAt,
            now,
          );
        } catch {
          return false;
        }

        if (input.action === "approve") {
          statements.upsertGrant.run(
            input.subjectDeviceId,
            input.vaultId,
            Buffer.from(input.grant!),
            now,
          );
          statements.activateDevice.run(now, input.actingDeviceId, input.subjectDeviceId);
        } else {
          // A revoked device must not keep a blob it could still open.
          statements.deleteGrant.run(input.subjectDeviceId);
          statements.revokeDevice.run(now, input.subjectDeviceId);
        }
        return true;
      }).immediate();
    },

    isAuthorizationSpent(statementHash: Uint8Array): boolean {
      return statements.findAuthorization.get(Buffer.from(statementHash)) !== undefined;
    },

    findDeviceGrant(deviceId: string): Uint8Array | undefined {
      const row = statements.findGrant.get(deviceId) as { grantBlob: Uint8Array } | undefined;
      return row?.grantBlob;
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
