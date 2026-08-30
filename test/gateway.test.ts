import { describe, expect, it, vi } from "vitest";
import { EndpointPool } from "../src/core/endpoint-pool.js";
import { GatewayUnavailableError } from "../src/core/errors.js";
import { RpcGateway } from "../src/core/gateway.js";
import { RpcTransport } from "../src/core/transport.js";
import { noopMetrics } from "../src/core/types.js";

const endpoints = [
  { id: "rpc-1", url: new URL("https://one.example") },
  { id: "rpc-2", url: new URL("https://two.example") },
] as const;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("RpcGateway", () => {
  it("fails over to a different endpoint for a retry-safe method", async () => {
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response({ jsonrpc: "2.0", id: 1, result: { latestLedger: 10 } }),
      );
    const pool = new EndpointPool(
      endpoints,
      { failureThreshold: 1, openDurationMs: 1_000 },
      () => 0,
    );
    const sleeper = vi.fn(async () => undefined);
    const gateway = new RpcGateway(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        requestTimeoutMs: 100,
        maxRetries: 2,
        retryBaseDelayMs: 10,
        sleeper,
        random: () => 0,
        metrics: noopMetrics,
      },
    );

    const result = await gateway.execute(
      { jsonrpc: "2.0", id: 1, method: "getLatestLedger" },
      "request-1",
    );

    expect(result).toMatchObject({
      endpointId: "rpc-2",
      attempts: 2,
      statusCode: 200,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(sleeper).toHaveBeenCalledWith(10);
    expect(pool.snapshots()[0]).toMatchObject({ state: "open", failures: 1 });
  });

  it("never retries sendTransaction", async () => {
    const mockedFetch = vi.fn(async () => response({}, 503));
    const pool = new EndpointPool(
      endpoints,
      { failureThreshold: 1, openDurationMs: 1_000 },
      () => 0,
    );
    const gateway = new RpcGateway(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        requestTimeoutMs: 100,
        maxRetries: 5,
        retryBaseDelayMs: 0,
        sleeper: async () => undefined,
        random: () => 0,
      },
    );

    await expect(
      gateway.execute(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "sendTransaction",
          params: { transaction: "x" },
        },
        "request-2",
      ),
    ).rejects.toMatchObject({ attempts: 1 });
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it("does not poison endpoint health for a non-retryable HTTP failure", async () => {
    const mockedFetch = vi.fn(async () => response({}, 400));
    const pool = new EndpointPool(endpoints.slice(0, 1), {
      failureThreshold: 1,
      openDurationMs: 1_000,
    });
    const gateway = new RpcGateway(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        requestTimeoutMs: 100,
        maxRetries: 2,
        retryBaseDelayMs: 0,
      },
    );

    await expect(
      gateway.execute(
        { jsonrpc: "2.0", id: 1, method: "getHealth" },
        "request-3",
      ),
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
    expect(pool.snapshots()[0]).toMatchObject({ state: "closed", failures: 0 });
  });

  it("reports no healthy endpoint after all circuits open", async () => {
    const mockedFetch = vi.fn(async () => response({}, 503));
    const pool = new EndpointPool(
      endpoints,
      { failureThreshold: 1, openDurationMs: 10_000 },
      () => 0,
    );
    const gateway = new RpcGateway(
      pool,
      new RpcTransport(mockedFetch as typeof fetch),
      {
        requestTimeoutMs: 100,
        maxRetries: 1,
        retryBaseDelayMs: 0,
        sleeper: async () => undefined,
        random: () => 0,
      },
    );

    await expect(
      gateway.execute(
        { jsonrpc: "2.0", id: 1, method: "getNetwork" },
        "request-4",
      ),
    ).rejects.toMatchObject({ attempts: 2 });
    expect(pool.isReady()).toBe(false);
  });
});
