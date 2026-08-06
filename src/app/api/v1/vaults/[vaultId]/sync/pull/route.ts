import { db } from "@/lib/db";
import { authorizeBlindVault, encodeBase64 } from "@/domain/e2ee/blind-sync.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  const authorization = await authorizeBlindVault(request, vaultId);
  if ("error" in authorization) return authorization.error;
  if (!authorization.vault) return Response.json({ error: "Vault not found" }, { status: 404 });
  const url = new URL(request.url);
  let after: bigint;
  try { after = BigInt(url.searchParams.get("after") ?? "0"); } catch { return Response.json({ error: "Invalid cursor" }, { status: 400 }); }
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  if (after < BigInt(0) || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) return Response.json({ error: "Invalid cursor or limit" }, { status: 400 });
  const records = await db.blindSyncRecord.findMany({ where: { vaultId, serverSeq: { gt: after } }, orderBy: { serverSeq: "asc" }, take: requestedLimit });
  return Response.json({ records: records.map((record) => ({ serverSeq: record.serverSeq.toString(), encodedRecord: encodeBase64(record.encodedRecord) })), nextCursor: records.at(-1)?.serverSeq.toString() ?? after.toString(), hasMore: records.length === requestedLimit });
}
