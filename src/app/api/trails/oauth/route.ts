import { auth } from "@/lib/auth";
import { OAUTH_PROVIDERS, isOAuthEnabled } from "@/domain/trail/oauth/providers";
import type { TrailKind } from "@/domain/trail/trail.types";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const kinds = Object.keys(OAUTH_PROVIDERS) as TrailKind[];
  const flags = await Promise.all(kinds.map((k) => isOAuthEnabled(k)));
  const enabled = kinds.filter((_, idx) => flags[idx]);
  return Response.json({ enabled });
}
