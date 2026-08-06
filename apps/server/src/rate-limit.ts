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

// Ephemeral keys would otherwise accumulate forever. Periodically drop entries
// with no active block and no recent activity; a re-created entry starts fresh,
// which is the correct post-TTL state anyway.
const SWEEP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 10 * 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of rateLimitStore) {
    const blocked = entry.blockedUntil !== null && entry.blockedUntil > now;
    const lastAttempt = entry.attempts.length ? entry.attempts[entry.attempts.length - 1]! : 0;
    if (!blocked && now - lastAttempt > ENTRY_TTL_MS) {
      rateLimitStore.delete(key);
    }
  }
}

export function consumeRateLimit(
  key: string,
  options: RateLimitOptions,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);
  const entry = rateLimitStore.get(key) ?? { attempts: [], blockedUntil: null };

  if (entry.blockedUntil && entry.blockedUntil > now) {
    rateLimitStore.set(key, entry);
    return { allowed: false, retryAfterMs: entry.blockedUntil - now };
  }

  entry.attempts = entry.attempts.filter((timestamp) => now - timestamp < options.windowMs);
  entry.blockedUntil = null;
  entry.attempts.push(now);

  if (entry.attempts.length > options.limit) {
    entry.blockedUntil = now + (options.blockMs ?? options.windowMs);
    rateLimitStore.set(key, entry);
    return { allowed: false, retryAfterMs: entry.blockedUntil - now };
  }

  rateLimitStore.set(key, entry);
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  rateLimitStore.delete(key);
}

export function resetAllRateLimits() {
  rateLimitStore.clear();
}
