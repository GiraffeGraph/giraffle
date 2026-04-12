import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/domain/feed/feed.service", () => ({
  refreshDueFeedsGlobally: vi.fn(),
}));

const { refreshDueFeedsGlobally } = await import("@/domain/feed/feed.service");
const { POST } = await import("@/app/api/feeds/refresh/route");

describe("POST /api/feeds/refresh", () => {
  const originalSecret = process.env.FEED_REFRESH_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEED_REFRESH_SECRET = "refresh-secret";
    vi.mocked(refreshDueFeedsGlobally).mockResolvedValue([
      {
        feedId: "feed-1",
        refreshedAt: new Date("2026-01-01T10:00:00Z"),
        itemCount: 4,
      },
    ] as never);
  });

  it("returns 503 when the secret is not configured", async () => {
    delete process.env.FEED_REFRESH_SECRET;

    const response = await POST(
      new Request("http://localhost/api/feeds/refresh", { method: "POST" })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "FEED_REFRESH_SECRET tanımlı değil.",
    });
  });

  it("returns 401 for invalid credentials", async () => {
    const response = await POST(
      new Request("http://localhost/api/feeds/refresh", {
        method: "POST",
        headers: { "x-feed-refresh-secret": "wrong-secret" },
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Yetkisiz istek." });
    expect(refreshDueFeedsGlobally).not.toHaveBeenCalled();
  });

  it("uses the provided limit when the request is authorized", async () => {
    const response = await POST(
      new Request("http://localhost/api/feeds/refresh", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer refresh-secret",
        },
        body: JSON.stringify({ limit: 7 }),
      })
    );

    expect(response.status).toBe(200);
    expect(refreshDueFeedsGlobally).toHaveBeenCalledWith(7);
    expect(await response.json()).toEqual({
      refreshed: 1,
      results: [
        {
          feedId: "feed-1",
          refreshedAt: "2026-01-01T10:00:00.000Z",
          itemCount: 4,
        },
      ],
    });
  });

  it("falls back to the default limit when the body is malformed", async () => {
    const response = await POST(
      new Request("http://localhost/api/feeds/refresh", {
        method: "POST",
        headers: {
          authorization: "Bearer refresh-secret",
          "content-type": "application/json",
        },
        body: "{not-json}",
      })
    );

    expect(response.status).toBe(200);
    expect(refreshDueFeedsGlobally).toHaveBeenCalledWith(12);
  });

  afterAll(() => {
    process.env.FEED_REFRESH_SECRET = originalSecret;
  });
});
