import { loadConfig } from "./core/config.js";
import { EndpointPool } from "./core/endpoint-pool.js";
import { RpcGateway } from "./core/gateway.js";
import { HealthMonitor } from "./core/health-monitor.js";
import { TokenBucketRateLimiter } from "./core/rate-limiter.js";
import { RpcTransport } from "./core/transport.js";
import { buildServer } from "./http/server.js";
import { GatewayMetrics } from "./observability/metrics.js";
import { startTelemetry } from "./observability/telemetry.js";

const config = loadConfig();
const telemetry = startTelemetry(config.otlpEndpoint);
const metrics = new GatewayMetrics();
const pool = new EndpointPool(config.endpoints, {
  failureThreshold: config.circuitFailureThreshold,
  openDurationMs: config.circuitOpenMs,
});
const transport = new RpcTransport();
const gateway = new RpcGateway(pool, transport, {
  requestTimeoutMs: config.requestTimeoutMs,
  maxRetries: config.maxRetries,
  retryBaseDelayMs: config.retryBaseDelayMs,
  metrics,
});
const limiter = new TokenBucketRateLimiter(
  config.rateLimitCapacity,
  config.rateLimitRefillPerSecond,
);
const healthMonitor = new HealthMonitor(pool, transport, {
  intervalMs: config.healthProbeIntervalMs,
  timeoutMs: config.requestTimeoutMs,
  metrics,
});
const server = buildServer({
  config,
  gateway,
  pool,
  limiter,
  metrics,
  enableLogger: config.logLevel !== "silent",
});

healthMonitor.start();
await server.listen({ host: config.host, port: config.port });
server.log.info(
  { endpointCount: config.endpoints.length },
  "RPC gateway started",
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  server.log.info({ signal }, "Shutting down RPC gateway");
  healthMonitor.stop();
  await server.close();
  await telemetry?.shutdown();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}
