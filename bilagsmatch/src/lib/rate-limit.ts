/**
 * Simple in-memory fixed-window rate limiter. Good enough for a single-process MVP;
 * a multi-instance deployment needs a shared store (Redis) instead.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Register an attempt. Returns false when the key is over the limit. */
  hit(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      this.prune(t);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  isBlocked(key: string): boolean {
    const entry = this.hits.get(key);
    return Boolean(entry && entry.resetAt > this.now() && entry.count >= this.limit);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(t: number): void {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

/** Login attempts: 10 per 15 minutes per email, 50 per 15 minutes per IP. */
export const loginLimiterByEmail = new RateLimiter(10, 15 * 60_000);
export const loginLimiterByIp = new RateLimiter(50, 15 * 60_000);
