import { z } from "zod";
import { auth } from "@/lib/auth";
import { createTrail, listTrails } from "@/domain/trail/trail.service";
import { TRAIL_KIND_CATALOG, type TrailKind } from "@/domain/trail/trail.types";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const trails = await listTrails(userId);
  return Response.json({ trails });
}

const CreateTrailSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1).max(160).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const parsed = CreateTrailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid trail payload", { status: 400 });
  const kind = parsed.data.kind as TrailKind;
  if (!TRAIL_KIND_CATALOG[kind]) return new Response("Unknown trail kind", { status: 400 });

  const trail = await createTrail({
    userId,
    kind,
    label: parsed.data.label ?? TRAIL_KIND_CATALOG[kind].label,
    config: parsed.data.config,
  });
  return Response.json({ trail }, { status: 201 });
}
