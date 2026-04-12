import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    resetRateLimit("login:test@example.com");
  });

  it("allows requests until the limit is exceeded", () => {
    const options = { limit: 2, windowMs: 60_000, blockMs: 120_000 };

    expect(consumeRateLimit("login:test@example.com", options)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(consumeRateLimit("login:test@example.com", options)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });

    const blocked = consumeRateLimit("login:test@example.com", options);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(120_000);
  });

  it("allows requests again after the rolling window expires", () => {
    const options = { limit: 1, windowMs: 60_000, blockMs: 30_000 };

    consumeRateLimit("login:test@example.com", options);
    consumeRateLimit("login:test@example.com", options);

    vi.advanceTimersByTime(60_001);

    expect(consumeRateLimit("login:test@example.com", options)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
  });
});
