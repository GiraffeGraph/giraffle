import { NextResponse } from "next/server";
import { refreshDueFeedsGlobally } from "@/domain/feed/feed.service";
import { getFeedRuntimeEnv } from "@/lib/env.server";
import { getRequestId, logger } from "@/lib/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const feedEnv = getFeedRuntimeEnv();

  if (!feedEnv.refreshSecret) {
    logger.warn("feed_refresh_not_configured", {
      requestId,
      route: "/api/feeds/refresh",
    });

    return NextResponse.json(
      { error: "FEED_REFRESH_SECRET is not configured." },
      { status: 503 }
    );
  }

  const providedSecret =
    request.headers.get("x-feed-refresh-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (providedSecret !== feedEnv.refreshSecret) {
    logger.warn("feed_refresh_unauthorized", {
      requestId,
      route: "/api/feeds/refresh",
    });

    return NextResponse.json({ error: "Unauthorized request." }, { status: 401 });
  }

  let limit = 12;

  try {
    const payload = (await request.json().catch(() => null)) as
      | { limit?: number }
      | null;

    if (typeof payload?.limit === "number" && Number.isFinite(payload.limit)) {
      limit = Math.max(1, Math.min(50, Math.round(payload.limit)));
    }
  } catch {
    // ignore malformed body and keep default limit
  }

  const results = await refreshDueFeedsGlobally(limit);

  logger.info("feed_refresh_completed", {
    requestId,
    route: "/api/feeds/refresh",
    refreshed: results.length,
    limit,
  });

  return NextResponse.json({
    refreshed: results.length,
    results: results.map((result) => ({
      feedId: result.feedId,
      refreshedAt: result.refreshedAt.toISOString(),
      itemCount: result.itemCount,
    })),
  });
}
