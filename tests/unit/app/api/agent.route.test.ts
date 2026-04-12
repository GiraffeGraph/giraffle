import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toTextStreamResponse: () => new Response("ok"),
  })),
}));

const { auth } = await import("@/lib/auth");
const { consumeRateLimit } = await import("@/lib/rate-limit");
const { streamText } = await import("ai");
const { POST } = await import("@/app/api/agent/route");

describe("POST /api/agent", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(consumeRateLimit).mockReturnValue({
      allowed: true,
      retryAfterMs: 0,
    });
  });

  it("returns 401 when the request is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    vi.mocked(consumeRateLimit).mockReturnValue({
      allowed: false,
      retryAfterMs: 4_500,
    });

    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("returns 503 when the AI service is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("AI service is not configured");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("rejects prompts that exceed the length limit", async () => {
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        body: JSON.stringify({ prompt: "x".repeat(4_001) }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Prompt is too long");
    expect(streamText).not.toHaveBeenCalled();
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });
});
