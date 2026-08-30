import { describe, expect, it, vi } from "vitest";
import { EndpointPool } from "../src/core/endpoint-pool.js";
import { HealthMonitor } from "../src/core/health-monitor.js";
import { RpcTransport } from "../src/core/transport.js";

const endpoints = [
  { id: "rpc-1", url: new URL("https://one.example") },
  { id: "rpc-2", url: new URL("https://two.example") },
] as const;

describe("HealthMonitor", () => {
  it("updates endpoint state from Stellar getHealth responses", async () => {
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "healthy" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "catching-up" },
          }),
        ),
      );
    const pool = new EndpointPool(
      endpoints,
      { failureThreshold: 1, openDurationMs: 1_000 },
      () => 0,
    );
    const monitor = new HealthMonitor(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        intervalMs: 10_000,
        timeoutMs: 100,
      },
    );

    await monitor.probeAll();
    expect(pool.snapshots()).toMatchObject([
      { id: "rpc-1", successes: 1, state: "closed" },
      { id: "rpc-2", failures: 1, state: "open" },
    ]);
  });

  it("is safe to start and stop more than once", () => {
    const mockedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ jsonrpc: "2.0", result: { status: "healthy" } }),
        ),
    );
    const pool = new EndpointPool(endpoints.slice(0, 1), {
      failureThreshold: 1,
      openDurationMs: 1_000,
    });
    const monitor = new HealthMonitor(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        intervalMs: 10_000,
        timeoutMs: 100,
      },
    );
    monitor.start();
    monitor.start();
    monitor.stop();
    monitor.stop();
  });
});
