interface RateLimitOptions {
  limit: number;
  windowMs: number;
  blockMs?: number;
}

interface RateLimitEntry {
  attempts: number[];
  blockedUntil: number | null;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function consumeRateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key) ?? {
    attempts: [],
    blockedUntil: null,
  };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    rateLimitStore.set(key, entry);
    return {
      allowed: false,
      retryAfterMs: entry.blockedUntil - now,
    };
  }

  entry.attempts = entry.attempts.filter(
    (timestamp) => now - timestamp < options.windowMs
  );
  entry.blockedUntil = null;
  entry.attempts.push(now);

  if (entry.attempts.length > options.limit) {
    entry.blockedUntil = now + (options.blockMs ?? options.windowMs);
    rateLimitStore.set(key, entry);
    return {
      allowed: false,
      retryAfterMs: entry.blockedUntil - now,
    };
  }

  rateLimitStore.set(key, entry);
  return {
    allowed: true,
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key: string) {
  rateLimitStore.delete(key);
}
