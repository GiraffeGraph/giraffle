import { auth } from "@/lib/auth";
import { listTrailLogs } from "@/domain/trail/trail.service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const trailId = url.searchParams.get("trailId") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const logs = await listTrailLogs({
    userId,
    trailId,
    limit: Number.isFinite(limit) ? (limit as number) : undefined,
  });
  return Response.json({ logs });
}
