export interface RateLimiter {
  allow(key: string, now?: number): boolean;
  reset(): void;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;
  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, stamps] of hits) {
      const kept = stamps.filter((stamp) => now - stamp < windowMs);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  };
  return {
    allow(key, now = Date.now()) {
      sweep(now);
      const stamps = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
      if (stamps.length >= limit) {
        hits.set(key, stamps);
        return false;
      }
      stamps.push(now);
      hits.set(key, stamps);
      return true;
    },
    reset() {
      hits.clear();
    }
  };
}

export const publicRateLimiter = createRateLimiter(120, 60_000);
export const loginRateLimiter = createRateLimiter(5, 60_000);
