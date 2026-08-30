import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "@prometheus-io/client";
import type { EndpointSnapshot, GatewayMetricsSink } from "../core/types.js";

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export class GatewayMetrics implements GatewayMetricsSink {
  private readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "rpc_gateway_requests_total",
    help: "Number of client JSON-RPC requests handled by the gateway.",
    labelNames: ["method", "outcome"],
    registers: [this.registry],
  });
  private readonly requestDuration = new Histogram({
    name: "rpc_gateway_request_duration_seconds",
    help: "End-to-end client request latency including retries.",
    labelNames: ["method", "outcome"],
    buckets: durationBuckets,
    registers: [this.registry],
  });
  private readonly requestAttempts = new Histogram({
    name: "rpc_gateway_request_attempts",
    help: "Number of upstream attempts needed per client request.",
    labelNames: ["method", "outcome"],
    buckets: [1, 2, 3, 4, 5],
    registers: [this.registry],
  });
  private readonly attempts = new Counter({
    name: "rpc_gateway_upstream_attempts_total",
    help: "Number of individual upstream attempts.",
    labelNames: ["endpoint", "outcome"],
    registers: [this.registry],
  });
  private readonly attemptDuration = new Histogram({
    name: "rpc_gateway_upstream_duration_seconds",
    help: "Latency of individual upstream requests.",
    labelNames: ["endpoint", "outcome"],
    buckets: durationBuckets,
    registers: [this.registry],
  });
  private readonly endpointScore = new Gauge({
    name: "rpc_gateway_endpoint_health_score",
    help: "Current endpoint selection score from 0 to 100.",
    labelNames: ["endpoint"],
    registers: [this.registry],
  });
  private readonly circuitState = new Gauge({
    name: "rpc_gateway_endpoint_circuit_state",
    help: "Circuit state: 0 closed, 1 half-open, 2 open.",
    labelNames: ["endpoint"],
    registers: [this.registry],
  });
  private readonly rateLimited = new Counter({
    name: "rpc_gateway_rate_limited_total",
    help: "Number of client requests rejected by the token-bucket limiter.",
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "rpc_gateway_process_",
    });
  }

  public observeAttempt(
    endpointId: string,
    outcome: "success" | "failure",
    durationMs: number,
  ): void {
    this.attempts.inc({ endpoint: endpointId, outcome });
    this.attemptDuration.observe(
      { endpoint: endpointId, outcome },
      durationMs / 1_000,
    );
  }

  public observeRequest(
    method: string,
    outcome: "success" | "failure",
    durationMs: number,
    attempts: number,
  ): void {
    this.requests.inc({ method, outcome });
    this.requestDuration.observe({ method, outcome }, durationMs / 1_000);
    this.requestAttempts.observe({ method, outcome }, attempts);
  }

  public updateEndpoint(snapshot: EndpointSnapshot): void {
    this.endpointScore.set({ endpoint: snapshot.id }, snapshot.score);
    const state =
      snapshot.state === "closed" ? 0 : snapshot.state === "half-open" ? 1 : 2;
    this.circuitState.set({ endpoint: snapshot.id }, state);
  }

  public incrementRateLimited(): void {
    this.rateLimited.inc();
  }

  public render(): Promise<string> {
    return this.registry.metrics();
  }

  public get contentType(): string {
    return this.registry.contentType;
  }
}
