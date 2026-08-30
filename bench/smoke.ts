import { performance } from "node:perf_hooks";

const target = process.env.BENCH_URL ?? "http://localhost:8080/rpc";
const total = Number(process.env.BENCH_REQUESTS ?? "200");
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? "20");
const durations: number[] = [];
let failures = 0;
let nextRequest = 0;

async function worker(): Promise<void> {
  while (nextRequest < total) {
    const id = nextRequest;
    nextRequest += 1;
    const started = performance.now();
    try {
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "benchmark",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method: "getLatestLedger" }),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - started);
    }
  }
}

const suiteStarted = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsedMs = performance.now() - suiteStarted;
durations.sort((left, right) => left - right);

function percentile(value: number): number {
  const index = Math.min(
    durations.length - 1,
    Math.floor(durations.length * value),
  );
  return durations[index] ?? 0;
}

process.stdout.write(
  `${JSON.stringify(
    {
      target,
      total,
      concurrency,
      failures,
      requestsPerSecond: Math.round((total / elapsedMs) * 1_000 * 100) / 100,
      latencyMs: {
        p50: Math.round(percentile(0.5) * 100) / 100,
        p95: Math.round(percentile(0.95) * 100) / 100,
        p99: Math.round(percentile(0.99) * 100) / 100,
      },
    },
    null,
    2,
  )}\n`,
);

if (failures > 0) process.exitCode = 1;
