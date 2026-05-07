import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getOAuthConfig,
  isOAuthEnabled,
} from "@/domain/trail/oauth/providers";
import { buildCallbackUrl, encodeOAuthState } from "@/domain/trail/oauth/state";
import { updateTrail } from "@/domain/trail/trail.service";
import type { TrailKind } from "@/domain/trail/trail.types";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ provider: string }>;
}

export async function GET(req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { provider } = await ctx.params;
  const kind = provider as TrailKind;
  if (!isOAuthEnabled(kind)) {
    return new Response(`OAuth provider not configured: ${provider}`, { status: 400 });
  }
  const config = getOAuthConfig(kind);
  if (!config) return new Response("Unknown provider", { status: 400 });

  const url = new URL(req.url);
  const trailId = url.searchParams.get("trailId");
  if (!trailId) return new Response("trailId is required", { status: 400 });

  const owned = await db.trail.findFirst({
    where: { id: trailId, userId, kind },
    select: { id: true },
  });
  if (!owned) return new Response("Trail not found", { status: 404 });

  const clientId = process.env[config.clientIdEnv]!;
  const callbackUrl = buildCallbackUrl(req, kind);
  const state = encodeOAuthState({ userId, trailId });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    state,
  });
  if (config.defaultScopes.length > 0) {
    params.set("scope", config.defaultScopes.join(" "));
  }
  for (const [k, v] of Object.entries(config.authorizeExtraParams ?? {})) {
    params.set(k, v);
  }

  await updateTrail(userId, trailId, { status: "connecting", lastError: null });

  const authorizeUrl = `${config.authorizationUrl}?${params.toString()}`;
  return Response.redirect(authorizeUrl, 302);
}
