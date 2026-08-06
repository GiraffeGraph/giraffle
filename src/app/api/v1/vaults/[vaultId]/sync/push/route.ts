import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authorizeBlindVault, decodeBoundedBase64 } from "@/domain/e2ee/blind-sync.server";
import { createSodiumCryptoProvider } from "@/domain/e2ee/crypto-provider";
import { bytesEqual, decodeSignedSyncRecord, encodeSignedSyncRecord, hashSignedSyncRecord, MAX_ENCODED_SYNC_RECORD_BYTES, verifySyncRecord } from "@/domain/e2ee/sync-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BATCH = 100;

export async function POST(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  const authorization = await authorizeBlindVault(request, vaultId);
  if ("error" in authorization) return authorization.error;
  if (!authorization.vault) return Response.json({ error: "Enroll this vault device before sync" }, { status: 404 });
  let body: { records?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > MAX_BATCH) return Response.json({ error: "Push batch must contain 1 to 100 records" }, { status: 400 });
  const crypto = await createSodiumCryptoProvider();
  const accepted: string[] = [];
  try {
    await db.$transaction(async (tx) => {
      for (const encodedValue of body.records as unknown[]) {
        const encoded = decodeBoundedBase64(encodedValue, MAX_ENCODED_SYNC_RECORD_BYTES);
        const record = decodeSignedSyncRecord(encoded);
        if (record.vaultId !== vaultId) throw new Error("Record vault does not match route");
        const device = await tx.blindDevice.findUnique({ where: { id: record.deviceId } });
        if (!device || device.vaultId !== vaultId || device.status !== "active" || device.revokedAt) throw new Error("Record device is not active");
        verifySyncRecord(crypto, record, device.signingPublicKey);
        const canonical = encodeSignedSyncRecord(record);
        if (!bytesEqual(canonical, encoded)) throw new Error("Record encoding is not canonical");
        const duplicate = await tx.blindSyncRecord.findUnique({ where: { vaultId_recordId: { vaultId, recordId: record.recordId } } });
        if (duplicate) {
          if (!Buffer.from(duplicate.encodedRecord).equals(encoded)) throw new Error("Record ID collision");
          accepted.push(record.recordId); continue;
        }
        const head = await tx.blindSyncRecord.findFirst({ where: { vaultId, deviceId: record.deviceId }, orderBy: { deviceSeq: "desc" } });
        const expectedSequence = (head?.deviceSeq ?? BigInt(0)) + BigInt(1);
        const expectedHash = head?.recordHash ?? new Uint8Array(32);
        if (BigInt(record.deviceSequence) !== expectedSequence || !bytesEqual(record.previousRecordHash, expectedHash)) throw new Error("Device sequence gap or hash-chain mismatch");
        await tx.blindSyncRecord.create({ data: { vaultId, recordId: record.recordId, deviceId: record.deviceId, deviceSeq: BigInt(record.deviceSequence), previousRecordHash: Uint8Array.from(record.previousRecordHash), objectLocator: Uint8Array.from(record.objectLocator), keyEpoch: record.keyEpoch, encodedRecord: Uint8Array.from(encoded), recordHash: Uint8Array.from(hashSignedSyncRecord(crypto, record)) } });
        accepted.push(record.recordId);
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Sync record rejected" }, { status: 409 });
  }
  return Response.json({ accepted });
}
