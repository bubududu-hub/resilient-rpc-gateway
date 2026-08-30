import type { CircuitState, Clock } from "./types.js";

export type CircuitBreakerOptions = Readonly<{
  failureThreshold: number;
  openDurationMs: number;
  clock?: Clock;
}>;

export class CircuitBreaker {
  private circuitState: CircuitState = "closed";
  private consecutiveFailuresValue = 0;
  private openUntil = 0;
  private halfOpenProbeInFlight = false;
  private readonly clock: Clock;

  public constructor(private readonly options: CircuitBreakerOptions) {
    this.clock = options.clock ?? Date.now;
  }

  public get state(): CircuitState {
    if (this.circuitState === "open" && this.clock() >= this.openUntil)
      return "half-open";
    return this.circuitState;
  }

  public get consecutiveFailures(): number {
    return this.consecutiveFailuresValue;
  }

  public isAvailable(): boolean {
    return this.state !== "open";
  }

  public tryAcquire(): boolean {
    const state = this.state;
    if (state === "open") return false;
    if (state === "closed") return true;
    if (this.halfOpenProbeInFlight) return false;
    this.circuitState = "half-open";
    this.halfOpenProbeInFlight = true;
    return true;
  }

  public recordSuccess(): void {
    this.circuitState = "closed";
    this.consecutiveFailuresValue = 0;
    this.openUntil = 0;
    this.halfOpenProbeInFlight = false;
  }

  public recordFailure(): void {
    this.halfOpenProbeInFlight = false;
    this.consecutiveFailuresValue += 1;
    if (
      this.circuitState === "half-open" ||
      this.consecutiveFailuresValue >= this.options.failureThreshold
    ) {
      this.circuitState = "open";
      this.openUntil = this.clock() + this.options.openDurationMs;
    }
  }
}
