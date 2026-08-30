import { describe, expect, it } from "vitest";
import { TokenBucketRateLimiter } from "../src/core/rate-limiter.js";

describe("TokenBucketRateLimiter", () => {
  it("rejects requests after capacity is exhausted and refills over time", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(2, 1, () => now);

    expect(limiter.consume("client")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.consume("client")).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.consume("client")).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });

    now = 1_000;
    expect(limiter.consume("client")).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it("isolates clients and caps accumulated tokens", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(3, 10, () => now);
    expect(limiter.consume("a", 3).allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(false);
    expect(limiter.consume("b").allowed).toBe(true);
    now = 10_000;
    expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("prunes idle buckets", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(1, 1, () => now);
    limiter.consume("old");
    now = 1_000;
    limiter.consume("new");
    expect(limiter.pruneIdle(500)).toBe(1);
    expect(limiter.pruneIdle(500)).toBe(0);
  });
});
