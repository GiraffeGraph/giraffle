import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteTrail,
  getTrailDetail,
  updateTrail,
} from "@/domain/trail/trail.service";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const detail = await getTrailDetail(userId, id);
  if (!detail) return new Response("Not found", { status: 404 });
  return Response.json({ trail: detail });
}

const PatchSchema = z.object({
  label: z.string().min(1).max(160).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["disconnected", "connecting", "active", "error", "revoked"]).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid patch", { status: 400 });
  const { id } = await ctx.params;
  const trail = await updateTrail(userId, id, parsed.data);
  if (!trail) return new Response("Not found", { status: 404 });
  return Response.json({ trail });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteTrail(userId, id);
  if (!ok) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
