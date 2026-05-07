import { z } from "zod";
import { auth } from "@/lib/auth";
import { setToolAllow } from "@/domain/trail/trail.service";

export const runtime = "nodejs";

const Schema = z.object({
  toolName: z.string().min(1).max(160),
  allowed: z.boolean(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const { id } = await ctx.params;
  try {
    await setToolAllow({
      userId,
      trailId: id,
      toolName: parsed.data.toolName,
      allowed: parsed.data.allowed,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "error", { status: 400 });
  }
  return new Response(null, { status: 204 });
}
