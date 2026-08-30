import type { AppConfig } from "../src/core/config.js";
import { EndpointPool } from "../src/core/endpoint-pool.js";
import { RpcGateway } from "../src/core/gateway.js";
import { TokenBucketRateLimiter } from "../src/core/rate-limiter.js";
import { RpcTransport } from "../src/core/transport.js";
import { buildServer } from "../src/http/server.js";
import { GatewayMetrics } from "../src/observability/metrics.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 8080,
  endpoints: [{ id: "rpc-1", url: new URL("https://rpc.example") }],
  requestTimeoutMs: 100,
  maxRetries: 0,
  retryBaseDelayMs: 0,
  circuitFailureThreshold: 1,
  circuitOpenMs: 1_000,
  healthProbeIntervalMs: 10_000,
  rateLimitCapacity: 10,
  rateLimitRefillPerSecond: 1,
  logLevel: "silent",
};

const servers: ReturnType<typeof buildServer>[] = [];

function harness(
  fetchImplementation: typeof fetch,
  capacity = 10,
): ReturnType<typeof buildServer> {
  const metrics = new GatewayMetrics();
  const pool = new EndpointPool(config.endpoints, {
    failureThreshold: config.circuitFailureThreshold,
    openDurationMs: config.circuitOpenMs,
  });
  const gateway = new RpcGateway(pool, new RpcTransport(fetchImplementation), {
    requestTimeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
    retryBaseDelayMs: config.retryBaseDelayMs,
    metrics,
  });
  const server = buildServer({
    config,
    pool,
    gateway,
    limiter: new TokenBucketRateLimiter(capacity, 1),
    metrics,
    enableLogger: false,
  });
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
});

describe("HTTP server", () => {
  it("proxies a valid request and exposes routing headers", async () => {
    const mockedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "healthy" },
          }),
        ),
    );
    const server = harness(mockedFetch as typeof fetch);
    const response = await server.inject({
      method: "POST",
      url: "/rpc",
      payload: { jsonrpc: "2.0", id: 1, method: "getHealth" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-rpc-endpoint"]).toBe("rpc-1");
    expect(response.headers["x-rpc-attempts"]).toBe("1");
    expect(response.json()).toMatchObject({ result: { status: "healthy" } });
  });

  it("rejects invalid JSON-RPC and rate-limits clients", async () => {
    const mockedFetch = vi.fn(async () => new Response("{}"));
    const server = harness(mockedFetch as typeof fetch, 1);
    const invalid = await server.inject({
      method: "POST",
      url: "/rpc",
      payload: { method: "x" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: -32600 } });

    const limited = await server.inject({
      method: "POST",
      url: "/rpc",
      payload: { jsonrpc: "2.0", id: 1, method: "getHealth" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("1");
  });

  it("returns a sanitized service error when the upstream is unavailable", async () => {
    const mockedFetch = vi.fn(async () => new Response("{}", { status: 503 }));
    const server = harness(mockedFetch as typeof fetch);
    const response = await server.inject({
      method: "POST",
      url: "/rpc",
      payload: { jsonrpc: "2.0", id: "a", method: "getNetwork" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: "a",
      error: { code: -32001, message: "No healthy RPC upstream is available" },
    });
  });

  it("exposes readiness, endpoint health, and Prometheus metrics", async () => {
    const mockedFetch = vi.fn(async () => new Response("{}"));
    const server = harness(mockedFetch as typeof fetch);
    const [health, ready, metrics] = await Promise.all([
      server.inject({ method: "GET", url: "/health" }),
      server.inject({ method: "GET", url: "/ready" }),
      server.inject({ method: "GET", url: "/metrics" }),
    ]);
    expect(health.json()).toMatchObject({
      status: "healthy",
      endpoints: [{ id: "rpc-1" }],
    });
    expect(ready.statusCode).toBe(200);
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("rpc_gateway_process_");
  });
});
