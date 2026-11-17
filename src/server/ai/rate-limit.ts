const hits = new Map<string, number[]>();

/**
 * Sliding-window limiter, kept in memory (per server instance). Gemini's free tier allows
 * only about 10 requests a minute across everyone, so each user gets a small share.
 * Returns true if the call is allowed and records it.
 */
export function allowRequest(key: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
}
