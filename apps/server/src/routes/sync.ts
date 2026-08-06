import { Hono } from "hono";
import {
  bytesEqual,
  decodeSignedSyncRecord,
  encodeSignedSyncRecord,
  hashSignedSyncRecord,
  MAX_ENCODED_SYNC_RECORD_BYTES,
  verifySyncRecord,
  zeroRecordHash,
} from "@giraffle/protocol";
import { getCryptoProvider } from "../crypto.ts";
import { decodeBoundedBase64, encodeBase64 } from "../encoding.ts";
import type { Store } from "../storage/queries.ts";
import { activeDevice, type AppEnv } from "./auth.ts";

const MAX_BATCH = 100;
const MAX_PULL_LIMIT = 100;
const DECIMAL = /^\d+$/;

export function syncRoutes(store: Store) {
  const routes = new Hono<AppEnv>();

  routes.use("/*", activeDevice(store));

  routes.post("/push", async (c) => {
    const auth = c.get("auth");
    if (!auth.vault) {
      return c.json({ error: "Enroll this vault device before sync" }, 404);
    }

    let body: { records?: unknown };
    try {
      body = (await c.req.json()) as { records?: unknown };
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const submitted = body.records;
    if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > MAX_BATCH) {
      return c.json({ error: "Push batch must contain 1 to 100 records" }, 400);
    }

    // Resolved before the transaction opens: better-sqlite3 transactions are
    // synchronous and cannot await.
    const crypto = await getCryptoProvider();
    const caller = c.get("device");
    let accepted: string[];

    try {
      accepted = store.inTransaction(() => {
        const batch: string[] = [];

        for (const encodedValue of submitted) {
          const encoded = decodeBoundedBase64(encodedValue, MAX_ENCODED_SYNC_RECORD_BYTES);
          const record = decodeSignedSyncRecord(encoded);

          if (record.vaultId !== auth.vaultId) {
            throw new Error("Record vault does not match route");
          }

          // A device may only extend its own hash chain, so the record author
          // and the caller identified in the request must be the same device.
          const device = store.findDevice(record.deviceId);
          if (
            !device ||
            device.id !== caller.id ||
            device.vaultId !== auth.vaultId ||
            device.status !== "active" ||
            device.revokedAt
          ) {
            throw new Error("Record device is not active");
          }

          verifySyncRecord(crypto, record, device.signingPublicKey);

          // A record that re-encodes differently would hash differently, which
          // would break the chain for every other device.
          if (!bytesEqual(encodeSignedSyncRecord(record), encoded)) {
            throw new Error("Record encoding is not canonical");
          }

          const duplicate = store.findRecordByRecordId(auth.vaultId, record.recordId);
          if (duplicate) {
            if (!Buffer.from(duplicate).equals(encoded)) {
              throw new Error("Record ID collision");
            }
            batch.push(record.recordId);
            continue;
          }

          const head = store.findDeviceHead(auth.vaultId, record.deviceId);
          const expectedSequence = (head?.deviceSeq ?? 0) + 1;
          const expectedHash = head?.recordHash ?? zeroRecordHash();
          if (
            record.deviceSequence !== expectedSequence ||
            !bytesEqual(record.previousRecordHash, expectedHash)
          ) {
            throw new Error("Device sequence gap or hash-chain mismatch");
          }

          store.insertRecord({
            vaultId: auth.vaultId,
            recordId: record.recordId,
            deviceId: record.deviceId,
            deviceSeq: record.deviceSequence,
            previousRecordHash: record.previousRecordHash,
            objectLocator: record.objectLocator,
            keyEpoch: record.keyEpoch,
            encodedRecord: encoded,
            recordHash: hashSignedSyncRecord(crypto, record),
          });
          batch.push(record.recordId);
        }

        return batch;
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Sync record rejected" }, 409);
    }

    return c.json({ accepted });
  });

  routes.get("/pull", (c) => {
    const auth = c.get("auth");
    if (!auth.vault) {
      return c.json({ error: "Vault not found" }, 404);
    }

    const afterParam = c.req.query("after") ?? "0";
    const limitParam = c.req.query("limit") ?? String(MAX_PULL_LIMIT);

    if (!DECIMAL.test(afterParam) || !DECIMAL.test(limitParam)) {
      return c.json({ error: "Invalid cursor or limit" }, 400);
    }

    const after = Number(afterParam);
    const limit = Number(limitParam);
    if (!Number.isSafeInteger(after) || limit < 1 || limit > MAX_PULL_LIMIT) {
      return c.json({ error: "Invalid cursor or limit" }, 400);
    }

    const records = store.listRecords(auth.vaultId, after, limit);

    return c.json({
      records: records.map((record) => ({
        serverSeq: String(record.serverSeq),
        encodedRecord: encodeBase64(record.encodedRecord),
      })),
      nextCursor: String(records.at(-1)?.serverSeq ?? after),
      hasMore: records.length === limit,
    });
  });

  return routes;
}
