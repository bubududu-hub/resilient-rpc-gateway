import { SpanStatusCode, trace } from "@opentelemetry/api";
import { EndpointPool } from "./endpoint-pool.js";
import { GatewayUnavailableError, TransportError } from "./errors.js";
import { RpcTransport } from "./transport.js";
import type {
  Clock,
  GatewayMetricsSink,
  GatewayResult,
  JsonRpcRequest,
  RandomSource,
  Sleeper,
} from "./types.js";
import { noopMetrics } from "./types.js";

export type RpcGatewayOptions = Readonly<{
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  clock?: Clock;
  sleeper?: Sleeper;
  random?: RandomSource;
  metrics?: GatewayMetricsSink;
}>;

const sleep: Sleeper = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function isSafeToRetry(method: string): boolean {
  return method !== "sendTransaction";
}

export class RpcGateway {
  private readonly clock: Clock;
  private readonly sleeper: Sleeper;
  private readonly random: RandomSource;
  private readonly metrics: GatewayMetricsSink;
  private readonly tracer = trace.getTracer("resilient-rpc-gateway");

  public constructor(
    private readonly pool: EndpointPool,
    private readonly transport: RpcTransport,
    private readonly options: RpcGatewayOptions,
  ) {
    this.clock = options.clock ?? Date.now;
    this.sleeper = options.sleeper ?? sleep;
    this.random = options.random ?? Math.random;
    this.metrics = options.metrics ?? noopMetrics;
  }

  public async execute(
    request: JsonRpcRequest,
    requestId: string,
  ): Promise<GatewayResult> {
    const startedAt = this.clock();
    const span = this.tracer.startSpan("rpc.gateway.request", {
      attributes: {
        "rpc.system": "jsonrpc",
        "rpc.method": request.method,
      },
    });
    const excluded = new Set<string>();
    const maximumAttempts = isSafeToRetry(request.method)
      ? Math.min(this.pool.size, this.options.maxRetries + 1)
      : 1;
    let attempts = 0;
    let lastError: Error | undefined;

    try {
      while (attempts < maximumAttempts) {
        const endpoint = this.pool.acquire(excluded);
        if (endpoint === undefined) break;
        excluded.add(endpoint.id);
        attempts += 1;
        const attemptStartedAt = this.clock();

        span.addEvent("rpc.attempt", {
          "rpc.endpoint.id": endpoint.id,
          "rpc.attempt": attempts,
        });
        try {
          const response = await this.transport.forward(
            endpoint,
            request,
            requestId,
            this.options.requestTimeoutMs,
          );
          const attemptDuration = this.clock() - attemptStartedAt;
          endpoint.recordSuccess(attemptDuration);
          this.metrics.observeAttempt(endpoint.id, "success", attemptDuration);
          this.metrics.updateEndpoint(endpoint.snapshot());
          this.metrics.observeRequest(
            request.method,
            "success",
            this.clock() - startedAt,
            attempts,
          );
          span.setAttributes({
            "rpc.endpoint.id": endpoint.id,
            "rpc.attempts": attempts,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            statusCode: response.statusCode,
            payload: response.payload,
            endpointId: endpoint.id,
            attempts,
          };
        } catch (error) {
          const transportError =
            error instanceof TransportError
              ? error
              : new TransportError(
                  "Unexpected upstream failure",
                  "network",
                  true,
                );
          const attemptDuration = this.clock() - attemptStartedAt;
          lastError = transportError;
          if (transportError.retryable) endpoint.recordFailure();
          else endpoint.recordNeutral();
          this.metrics.observeAttempt(endpoint.id, "failure", attemptDuration);
          this.metrics.updateEndpoint(endpoint.snapshot());
          span.addEvent("rpc.attempt.failed", {
            "rpc.endpoint.id": endpoint.id,
            "error.type": transportError.kind,
            "error.retryable": transportError.retryable,
          });

          if (!transportError.retryable || attempts >= maximumAttempts) break;
          const backoff =
            this.options.retryBaseDelayMs * 2 ** (attempts - 1) +
            this.random() * this.options.retryBaseDelayMs;
          await this.sleeper(backoff);
        }
      }

      throw new GatewayUnavailableError(
        lastError?.message ?? "No healthy RPC upstream is available",
        attempts,
      );
    } catch (error) {
      this.metrics.observeRequest(
        request.method,
        "failure",
        this.clock() - startedAt,
        attempts,
      );
      span.recordException(
        error instanceof Error ? error : new Error("Unknown gateway failure"),
      );
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }
}
