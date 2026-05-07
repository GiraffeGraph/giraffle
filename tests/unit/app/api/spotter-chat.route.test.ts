import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    spotterMessage: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/domain/agent/loop", () => ({
  runAgent: vi.fn(),
}));

vi.mock("@/domain/spotter/spotter.service", () => ({
  appendSpotterMessage: vi.fn(),
  assertSpotterSessionOwner: vi.fn(),
  buildSpotterSessionTitle: (s: string) => s,
  createSpotterSession: vi.fn(),
  touchSpotterSession: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { consumeRateLimit } = await import("@/lib/rate-limit");
const { runAgent } = await import("@/domain/agent/loop");
const {
  assertSpotterSessionOwner,
  createSpotterSession,
} = await import("@/domain/spotter/spotter.service");
const { POST } = await import("@/app/api/spotter/chat/route");

function makeUiMessages(text: string) {
  return [
    {
      id: "u1",
      role: "user" as const,
      parts: [{ type: "text", text }],
    },
  ];
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/spotter/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/spotter/chat", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(consumeRateLimit).mockReturnValue({
      allowed: true,
      retryAfterMs: 0,
    });
    vi.mocked(createSpotterSession).mockResolvedValue({
      id: "sess-1",
      title: "hi",
    } as never);
    vi.mocked(runAgent).mockResolvedValue({
      response: new Response("ok"),
    } as never);
  });

  it("returns 401 when the request is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest({ messages: makeUiMessages("hi") }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    vi.mocked(consumeRateLimit).mockReturnValue({
      allowed: false,
      retryAfterMs: 4_500,
    });
    const res = await POST(makeRequest({ messages: makeUiMessages("hi") }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload", async () => {
    const res = await POST(makeRequest({ wrong: true }));
    expect(res.status).toBe(400);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("forwards a session id when one is supplied and owned", async () => {
    vi.mocked(assertSpotterSessionOwner).mockResolvedValue({
      id: "sess-existing",
      title: "T",
    } as never);
    const res = await POST(
      makeRequest({ id: "sess-existing", messages: makeUiMessages("hello") }),
    );
    expect(res.status).toBe(200);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runAgent).mock.calls[0][0].sessionId).toBe("sess-existing");
  });

  it("creates a new session when none is supplied", async () => {
    const res = await POST(makeRequest({ messages: makeUiMessages("hello") }));
    expect(res.status).toBe(200);
    expect(createSpotterSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runAgent).mock.calls[0][0].sessionId).toBe("sess-1");
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });
});
