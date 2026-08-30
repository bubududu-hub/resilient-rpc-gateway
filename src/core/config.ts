import type { EndpointDefinition } from "./types.js";

export type AppConfig = Readonly<{
  host: string;
  port: number;
  endpoints: readonly EndpointDefinition[];
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  circuitFailureThreshold: number;
  circuitOpenMs: number;
  healthProbeIntervalMs: number;
  rateLimitCapacity: number;
  rateLimitRefillPerSecond: number;
  logLevel: string;
  otlpEndpoint?: string;
}>;

function integer(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer greater than or equal to ${String(minimum)}`,
    );
  }
  return value;
}

function positiveNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number`);
  return value;
}

function nonEmpty(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value === undefined || value === "" ? fallback : value;
}

function parseEndpoints(
  raw: string | undefined,
): readonly EndpointDefinition[] {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      "RPC_ENDPOINTS must contain at least one comma-separated HTTP(S) URL",
    );
  }

  const endpoints = raw.split(",").map((entry, index) => {
    let url: URL;
    try {
      url = new URL(entry.trim());
    } catch {
      throw new Error(
        `RPC_ENDPOINTS entry ${String(index + 1)} is not a valid URL`,
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(
        `RPC_ENDPOINTS entry ${String(index + 1)} must use HTTP or HTTPS`,
      );
    }
    return { id: `rpc-${String(index + 1)}`, url };
  });

  const unique = new Set(endpoints.map(({ url }) => url.href));
  if (unique.size !== endpoints.length)
    throw new Error("RPC_ENDPOINTS must not contain duplicates");
  return endpoints;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const otlpEndpoint = environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (otlpEndpoint !== undefined && otlpEndpoint !== "") {
    const parsed = new URL(otlpEndpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT must use HTTP or HTTPS");
    }
  }

  return {
    host: nonEmpty(environment.HOST, "0.0.0.0"),
    port: integer("PORT", environment.PORT, 8080, 1),
    endpoints: parseEndpoints(environment.RPC_ENDPOINTS),
    requestTimeoutMs: integer(
      "REQUEST_TIMEOUT_MS",
      environment.REQUEST_TIMEOUT_MS,
      2_500,
      1,
    ),
    maxRetries: integer("MAX_RETRIES", environment.MAX_RETRIES, 2, 0),
    retryBaseDelayMs: integer(
      "RETRY_BASE_DELAY_MS",
      environment.RETRY_BASE_DELAY_MS,
      50,
      0,
    ),
    circuitFailureThreshold: integer(
      "CIRCUIT_FAILURE_THRESHOLD",
      environment.CIRCUIT_FAILURE_THRESHOLD,
      3,
      1,
    ),
    circuitOpenMs: integer(
      "CIRCUIT_OPEN_MS",
      environment.CIRCUIT_OPEN_MS,
      30_000,
      1,
    ),
    healthProbeIntervalMs: integer(
      "HEALTH_PROBE_INTERVAL_MS",
      environment.HEALTH_PROBE_INTERVAL_MS,
      10_000,
      1,
    ),
    rateLimitCapacity: positiveNumber(
      "RATE_LIMIT_CAPACITY",
      environment.RATE_LIMIT_CAPACITY,
      100,
    ),
    rateLimitRefillPerSecond: positiveNumber(
      "RATE_LIMIT_REFILL_PER_SECOND",
      environment.RATE_LIMIT_REFILL_PER_SECOND,
      20,
    ),
    logLevel: nonEmpty(environment.LOG_LEVEL, "info"),
    ...(otlpEndpoint === undefined || otlpEndpoint === ""
      ? {}
      : { otlpEndpoint }),
  };
}
