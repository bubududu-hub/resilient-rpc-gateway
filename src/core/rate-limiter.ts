import type { Clock } from "./types.js";

export type RateLimitResult = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}>;

type Bucket = {
  tokens: number;
  updatedAt: number;
};

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  public constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly clock: Clock = Date.now,
  ) {}

  public consume(key: string, cost = 1): RateLimitResult {
    const now = this.clock();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAt: now,
    };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1_000;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSeconds * this.refillPerSecond,
    );
    bucket.updatedAt = now;

    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;
    this.buckets.set(key, bucket);

    const deficit = allowed ? 0 : Math.max(0, cost - bucket.tokens);
    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil(deficit / this.refillPerSecond)),
    };
  }

  public pruneIdle(maxIdleMs: number): number {
    const threshold = this.clock() - maxIdleMs;
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.updatedAt < threshold) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
