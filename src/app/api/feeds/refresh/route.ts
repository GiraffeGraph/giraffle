import { NextResponse } from "next/server";
import { refreshDueFeedsGlobally } from "@/domain/feed/feed.service";

export async function POST(request: Request) {
  const secret = process.env.FEED_REFRESH_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "FEED_REFRESH_SECRET tanımlı değil." },
      { status: 503 },
    );
  }

  const providedSecret =
    request.headers.get("x-feed-refresh-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (providedSecret !== secret) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
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

  return NextResponse.json({
    refreshed: results.length,
    results: results.map((result) => ({
      feedId: result.feedId,
      refreshedAt: result.refreshedAt.toISOString(),
      itemCount: result.itemCount,
    })),
  });
}
