import { z } from "zod";
import { auth } from "@/lib/auth";
import { setTrailCredential } from "@/domain/trail/trail.service";

export const runtime = "nodejs";

const Schema = z.object({
  scope: z.string().min(1).max(40).optional(),
  secret: z.string().min(1).max(8_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid credential payload", { status: 400 });
  const { id } = await ctx.params;
  try {
    await setTrailCredential({
      userId,
      trailId: id,
      scope: parsed.data.scope,
      secret: parsed.data.secret,
      metadata: parsed.data.metadata,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "error", { status: 400 });
  }
  return new Response(null, { status: 204 });
}
