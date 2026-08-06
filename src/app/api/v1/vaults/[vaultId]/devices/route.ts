import { db } from "@/lib/db";
import { authorizeBlindVault, decodeBoundedBase64 } from "@/domain/e2ee/blind-sync.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  const authorization = await authorizeBlindVault(request, vaultId);
  if ("error" in authorization) return authorization.error;
  let body: { deviceId?: unknown; name?: unknown; signingPublicKey?: unknown; agreementPublicKey?: unknown; protocolVersion?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.protocolVersion !== 1 || typeof body.deviceId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(body.deviceId) || typeof body.name !== "string" || body.name.length < 1 || body.name.length > 80) return Response.json({ error: "Invalid device enrollment" }, { status: 400 });
  let signingPublicKey: Buffer, agreementPublicKey: Buffer;
  try { signingPublicKey = decodeBoundedBase64(body.signingPublicKey, 32); agreementPublicKey = decodeBoundedBase64(body.agreementPublicKey, 32); } catch { return Response.json({ error: "Invalid device public keys" }, { status: 400 }); }
  if (signingPublicKey.length !== 32 || agreementPublicKey.length !== 32) return Response.json({ error: "Device public keys must be 32 bytes" }, { status: 400 });
  const existingDevices = authorization.vault ? await db.blindDevice.count({ where: { vaultId, status: "active" } }) : 0;
  if (existingDevices > 0) {
    const existing = await db.blindDevice.findUnique({ where: { id: body.deviceId } });
    if (!existing || existing.vaultId !== vaultId || !Buffer.from(existing.signingPublicKey).equals(signingPublicKey)) return Response.json({ error: "A trusted device must authorize additional enrollment" }, { status: 409 });
    return Response.json({ deviceId: existing.id, status: existing.status });
  }
  await db.$transaction(async (tx) => {
    await tx.blindVault.upsert({ where: { id: vaultId }, create: { id: vaultId, ownerId: authorization.token.userId, protocolVersion: 1 }, update: {} });
    await tx.blindDevice.create({ data: { id: body.deviceId as string, vaultId, name: body.name as string, signingPublicKey: Uint8Array.from(signingPublicKey), agreementPublicKey: Uint8Array.from(agreementPublicKey) } });
  });
  return Response.json({ deviceId: body.deviceId, status: "active" }, { status: 201 });
}
