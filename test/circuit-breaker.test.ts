import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/core/circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("opens after the configured number of consecutive failures", () => {
    let now = 1_000;
    const circuit = new CircuitBreaker({
      failureThreshold: 2,
      openDurationMs: 500,
      clock: () => now,
    });

    expect(circuit.tryAcquire()).toBe(true);
    circuit.recordFailure();
    expect(circuit.state).toBe("closed");
    expect(circuit.tryAcquire()).toBe(true);
    circuit.recordFailure();

    expect(circuit.state).toBe("open");
    expect(circuit.tryAcquire()).toBe(false);
    now += 499;
    expect(circuit.state).toBe("open");
  });

  it("allows one half-open probe and closes on success", () => {
    let now = 0;
    const circuit = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 100,
      clock: () => now,
    });

    circuit.recordFailure();
    now = 100;
    expect(circuit.state).toBe("half-open");
    expect(circuit.tryAcquire()).toBe(true);
    expect(circuit.tryAcquire()).toBe(false);
    circuit.recordSuccess();

    expect(circuit.state).toBe("closed");
    expect(circuit.consecutiveFailures).toBe(0);
  });

  it("reopens when a half-open probe fails", () => {
    let now = 0;
    const circuit = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 100,
      clock: () => now,
    });

    circuit.recordFailure();
    now = 100;
    expect(circuit.tryAcquire()).toBe(true);
    circuit.recordFailure();
    expect(circuit.state).toBe("open");
    now = 199;
    expect(circuit.tryAcquire()).toBe(false);
    now = 200;
    expect(circuit.tryAcquire()).toBe(true);
  });
});
