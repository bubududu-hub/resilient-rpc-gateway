import { describe, expect, it } from "vitest";
import { EndpointPool } from "../src/core/endpoint-pool.js";

const definitions = [
  { id: "rpc-1", url: new URL("https://one.example") },
  { id: "rpc-2", url: new URL("https://two.example") },
] as const;

describe("EndpointPool", () => {
  it("selects an available endpoint and excludes already-tried endpoints", () => {
    const pool = new EndpointPool(
      definitions,
      { failureThreshold: 2, openDurationMs: 100 },
      () => 0,
    );
    const first = pool.acquire();
    expect(first?.id).toBe("rpc-1");
    first?.recordSuccess(20);
    const second = pool.acquire(new Set(["rpc-1"]));
    expect(second?.id).toBe("rpc-2");
    second?.recordNeutral();
  });

  it("removes an open circuit from selection", () => {
    const pool = new EndpointPool(
      definitions,
      { failureThreshold: 1, openDurationMs: 100 },
      () => 0,
    );
    const first = pool.acquire();
    first?.recordFailure();
    const selected = pool.acquire();
    expect(selected?.id).toBe("rpc-2");
    selected?.recordNeutral();
    expect(pool.snapshots()[0]).toMatchObject({
      state: "open",
      score: 0,
      failures: 1,
    });
  });

  it("incorporates latency and failures into health scoring", () => {
    const pool = new EndpointPool(
      definitions,
      { failureThreshold: 5, openDurationMs: 100 },
      () => 0,
    );
    const slow = pool.acquire();
    slow?.recordSuccess(2_000);
    const fast = pool.acquire(new Set(["rpc-1"]));
    fast?.recordSuccess(10);
    expect(pool.snapshots()[1]?.score).toBeGreaterThan(
      pool.snapshots()[0]?.score ?? 0,
    );
    expect(pool.isReady()).toBe(true);
  });
});
