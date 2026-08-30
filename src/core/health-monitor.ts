import { EndpointPool } from "./endpoint-pool.js";
import { RpcTransport } from "./transport.js";
import type { Clock, GatewayMetricsSink, JsonRpcRequest } from "./types.js";
import { noopMetrics } from "./types.js";

export type HealthMonitorOptions = Readonly<{
  intervalMs: number;
  timeoutMs: number;
  clock?: Clock;
  metrics?: GatewayMetricsSink;
}>;

const healthRequest: JsonRpcRequest = {
  jsonrpc: "2.0",
  id: "gateway-health",
  method: "getHealth",
};

function isHealthy(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const result = (payload as Record<string, unknown>).result;
  return (
    result !== null &&
    typeof result === "object" &&
    (result as Record<string, unknown>).status === "healthy"
  );
}

export class HealthMonitor {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly clock: Clock;
  private readonly metrics: GatewayMetricsSink;

  public constructor(
    private readonly pool: EndpointPool,
    private readonly transport: RpcTransport,
    private readonly options: HealthMonitorOptions,
  ) {
    this.clock = options.clock ?? Date.now;
    this.metrics = options.metrics ?? noopMetrics;
  }

  public start(): void {
    if (this.timer !== undefined) return;
    void this.probeAll();
    this.timer = setInterval(
      () => void this.probeAll(),
      this.options.intervalMs,
    );
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  public async probeAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all(
        this.pool.all().map(async (endpoint) => {
          if (!endpoint.tryAcquire()) return;
          const startedAt = this.clock();
          try {
            const response = await this.transport.forward(
              endpoint,
              healthRequest,
              `health-${endpoint.id}-${String(this.clock())}`,
              this.options.timeoutMs,
            );
            const duration = this.clock() - startedAt;
            if (!isHealthy(response.payload))
              throw new Error("RPC health response was not healthy");
            endpoint.recordSuccess(duration);
            this.metrics.observeAttempt(endpoint.id, "success", duration);
          } catch {
            const duration = this.clock() - startedAt;
            endpoint.recordFailure();
            this.metrics.observeAttempt(endpoint.id, "failure", duration);
          } finally {
            this.metrics.updateEndpoint(endpoint.snapshot());
          }
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
