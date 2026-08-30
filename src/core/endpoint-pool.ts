import { CircuitBreaker } from "./circuit-breaker.js";
import type {
  Clock,
  EndpointDefinition,
  EndpointSnapshot,
  RandomSource,
} from "./types.js";

export type EndpointRuntimeOptions = Readonly<{
  failureThreshold: number;
  openDurationMs: number;
  clock?: Clock;
}>;

export class EndpointRuntime {
  private readonly circuit: CircuitBreaker;
  private ewmaLatency: number | undefined;
  private successesValue = 0;
  private failuresValue = 0;
  private activeRequestsValue = 0;

  public constructor(
    public readonly definition: EndpointDefinition,
    options: EndpointRuntimeOptions,
  ) {
    this.circuit = new CircuitBreaker({
      failureThreshold: options.failureThreshold,
      openDurationMs: options.openDurationMs,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
  }

  public get id(): string {
    return this.definition.id;
  }

  public get url(): URL {
    return this.definition.url;
  }

  public get score(): number {
    if (!this.circuit.isAvailable()) return 0;
    const attempts = this.successesValue + this.failuresValue;
    const successRatio = attempts === 0 ? 0.75 : this.successesValue / attempts;
    const latencyScore =
      this.ewmaLatency === undefined
        ? 25
        : Math.max(0, 30 - this.ewmaLatency / 100);
    const stateScore = this.circuit.state === "closed" ? 45 : 20;
    const value =
      stateScore +
      latencyScore +
      successRatio * 25 -
      this.activeRequestsValue * 5 -
      this.circuit.consecutiveFailures * 10;
    return Math.max(0, Math.min(100, value));
  }

  public tryAcquire(): boolean {
    if (!this.circuit.tryAcquire()) return false;
    this.activeRequestsValue += 1;
    return true;
  }

  public recordSuccess(latencyMs: number): void {
    this.release();
    this.successesValue += 1;
    this.ewmaLatency =
      this.ewmaLatency === undefined
        ? latencyMs
        : this.ewmaLatency * 0.8 + latencyMs * 0.2;
    this.circuit.recordSuccess();
  }

  public recordFailure(): void {
    this.release();
    this.failuresValue += 1;
    this.circuit.recordFailure();
  }

  public recordNeutral(): void {
    this.release();
  }

  public snapshot(): EndpointSnapshot {
    return {
      id: this.id,
      state: this.circuit.state,
      score: Math.round(this.score * 100) / 100,
      activeRequests: this.activeRequestsValue,
      consecutiveFailures: this.circuit.consecutiveFailures,
      ewmaLatencyMs:
        this.ewmaLatency === undefined
          ? null
          : Math.round(this.ewmaLatency * 100) / 100,
      successes: this.successesValue,
      failures: this.failuresValue,
    };
  }

  private release(): void {
    this.activeRequestsValue = Math.max(0, this.activeRequestsValue - 1);
  }
}

export class EndpointPool {
  private readonly endpoints: readonly EndpointRuntime[];

  public constructor(
    definitions: readonly EndpointDefinition[],
    options: EndpointRuntimeOptions,
    private readonly random: RandomSource = Math.random,
  ) {
    this.endpoints = definitions.map(
      (definition) => new EndpointRuntime(definition, options),
    );
  }

  public get size(): number {
    return this.endpoints.length;
  }

  public acquire(
    excludedIds: ReadonlySet<string> = new Set(),
  ): EndpointRuntime | undefined {
    const ranked = this.endpoints
      .filter((endpoint) => !excludedIds.has(endpoint.id) && endpoint.score > 0)
      .map((endpoint) => ({ endpoint, tieBreaker: this.random() }))
      .sort(
        (left, right) =>
          right.endpoint.score - left.endpoint.score ||
          right.tieBreaker - left.tieBreaker,
      );

    for (const { endpoint } of ranked) {
      if (endpoint.tryAcquire()) return endpoint;
    }
    return undefined;
  }

  public all(): readonly EndpointRuntime[] {
    return this.endpoints;
  }

  public snapshots(): readonly EndpointSnapshot[] {
    return this.endpoints.map((endpoint) => endpoint.snapshot());
  }

  public isReady(): boolean {
    return this.endpoints.some((endpoint) => endpoint.score > 0);
  }
}
