import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../core/config.js";
import { EndpointPool } from "../core/endpoint-pool.js";
import { GatewayUnavailableError } from "../core/errors.js";
import { RpcGateway } from "../core/gateway.js";
import { TokenBucketRateLimiter } from "../core/rate-limiter.js";
import {
  isJsonRpcRequest,
  jsonRpcError,
  type GatewayMetricsSink,
} from "../core/types.js";
import type { GatewayMetrics } from "../observability/metrics.js";

export type ServerDependencies = Readonly<{
  config: AppConfig;
  gateway: RpcGateway;
  pool: EndpointPool;
  limiter: TokenBucketRateLimiter;
  metrics: GatewayMetrics & GatewayMetricsSink;
  enableLogger?: boolean;
}>;

function rateLimitIdentity(apiKey: string | undefined, ip: string): string {
  const value = apiKey === undefined ? `ip:${ip}` : `key:${apiKey}`;
  return createHash("sha256").update(value).digest("hex");
}

export function buildServer(dependencies: ServerDependencies): FastifyInstance {
  const { config, gateway, pool, limiter, metrics } = dependencies;
  const app = Fastify({
    logger:
      dependencies.enableLogger === false ? false : { level: config.logLevel },
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id",
  });

  app.get("/health", async () => ({
    status: pool.isReady() ? "healthy" : "degraded",
    endpoints: pool.snapshots(),
  }));

  app.get("/ready", async (_request, reply) => {
    const ready = pool.isReady();
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? "ready" : "not-ready" });
  });

  app.get("/metrics", async (_request, reply) => {
    return reply
      .header("content-type", metrics.contentType)
      .send(await metrics.render());
  });

  app.post("/rpc", async (request, reply) => {
    const apiKeyHeader = request.headers["x-api-key"];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    const limit = limiter.consume(rateLimitIdentity(apiKey, request.ip));
    reply.header("x-ratelimit-remaining", limit.remaining);
    if (!limit.allowed) {
      metrics.incrementRateLimited();
      return await reply
        .code(429)
        .header("retry-after", limit.retryAfterSeconds)
        .send(jsonRpcError(null, -32029, "Gateway rate limit exceeded"));
    }

    if (!isJsonRpcRequest(request.body)) {
      return reply
        .code(400)
        .send(jsonRpcError(null, -32600, "Invalid JSON-RPC 2.0 request"));
    }

    try {
      const result = await gateway.execute(request.body, request.id);
      return await reply
        .code(result.statusCode)
        .header("x-rpc-endpoint", result.endpointId)
        .header("x-rpc-attempts", result.attempts)
        .send(result.payload);
    } catch (error) {
      request.log.warn(
        {
          err: error,
          rpcMethod: request.body.method,
          attempts:
            error instanceof GatewayUnavailableError
              ? error.attempts
              : undefined,
        },
        "RPC request failed",
      );
      if (error instanceof GatewayUnavailableError) {
        return reply
          .code(503)
          .send(
            jsonRpcError(
              request.body.id ?? null,
              -32001,
              "No healthy RPC upstream is available",
            ),
          );
      }
      return reply
        .code(500)
        .send(
          jsonRpcError(
            request.body.id ?? null,
            -32603,
            "Internal gateway error",
          ),
        );
    }
  });

  return app;
}
