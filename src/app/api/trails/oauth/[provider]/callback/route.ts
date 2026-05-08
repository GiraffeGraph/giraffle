import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { exchangeCodeForTokens } from "@/domain/trail/oauth/exchange";
import {
  getOAuthConfig,
  resolveOAuthCredentials,
} from "@/domain/trail/oauth/providers";
import {
  buildCallbackUrl,
  buildPublicOrigin,
  decodeOAuthState,
} from "@/domain/trail/oauth/state";
import { persistOAuthTokens } from "@/domain/trail/oauth/access-token";
import { updateTrail } from "@/domain/trail/trail.service";
import type { TrailKind } from "@/domain/trail/trail.types";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ provider: string }>;
}

async function redirectToTrails(req: Request, message: string, ok: boolean) {
  const origin = await buildPublicOrigin(req);
  const url = new URL("/trails", origin);
  url.searchParams.set("oauth", ok ? "success" : "error");
  url.searchParams.set("message", message.slice(0, 200));
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: Request, ctx: Ctx) {
  const { provider } = await ctx.params;
  const kind = provider as TrailKind;
  const credentials = await resolveOAuthCredentials(kind);
  if (!credentials) {
    return redirectToTrails(req, "Provider not configured", false);
  }
  const config = getOAuthConfig(kind);
  if (!config) return redirectToTrails(req, "Unknown provider", false);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return redirectToTrails(req, error, false);
  if (!code || !stateRaw) {
    return redirectToTrails(req, "Missing code or state", false);
  }
  const state = decodeOAuthState(stateRaw);
  if (!state) return redirectToTrails(req, "Invalid or expired state", false);

  const owned = await db.trail.findFirst({
    where: { id: state.trailId, userId: state.userId, kind },
    select: { id: true },
  });
  if (!owned) return redirectToTrails(req, "Trail not found", false);

  try {
    const tokens = await exchangeCodeForTokens({
      config,
      code,
      redirectUri: await buildCallbackUrl(req, kind),
    });
    await persistOAuthTokens({
      userId: state.userId,
      trailId: state.trailId,
      tokens,
      preserveRefreshIfMissing: config.refreshTokenStickiness ?? false,
    });
    await updateTrail(state.userId, state.trailId, {
      status: "active",
      lastError: null,
      lastSyncAt: new Date(),
    });
    return redirectToTrails(req, "Connected", true);
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : String(error_);
    logger.warn("trail_oauth_callback_failed", { kind, trailId: state.trailId, message });
    await updateTrail(state.userId, state.trailId, {
      status: "error",
      lastError: message,
    });
    return redirectToTrails(req, message, false);
  }
}
