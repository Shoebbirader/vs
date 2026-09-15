type Bucket = { count: number; resetAt: number };

export function createRateLimiter(limit = 240, windowMs = 60_000) {
  const buckets = new Map<string, Bucket>();
  return (key: string, now = Date.now()) => {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 10_000) {
        for (const [entryKey, entry] of Array.from(buckets.entries())) if (entry.resetAt <= now) buckets.delete(entryKey);
      }
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: windowMs };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfterMs: Math.max(0, current.resetAt - now) };
  };
}
