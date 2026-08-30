export type JsonRpcId = string | number | null;

export type JsonRpcRequest = Readonly<{
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}>;

export type JsonRpcError = Readonly<{
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: Readonly<{
    code: number;
    message: string;
    data?: unknown;
  }>;
}>;

export type EndpointDefinition = Readonly<{
  id: string;
  url: URL;
}>;

export type CircuitState = "closed" | "open" | "half-open";

export type EndpointSnapshot = Readonly<{
  id: string;
  state: CircuitState;
  score: number;
  activeRequests: number;
  consecutiveFailures: number;
  ewmaLatencyMs: number | null;
  successes: number;
  failures: number;
}>;

export type GatewayResult = Readonly<{
  statusCode: number;
  payload: unknown;
  endpointId: string;
  attempts: number;
}>;

export type Clock = () => number;
export type Sleeper = (milliseconds: number) => Promise<void>;
export type RandomSource = () => number;

export type GatewayMetricsSink = Readonly<{
  observeAttempt: (
    endpointId: string,
    outcome: "success" | "failure",
    durationMs: number,
  ) => void;
  observeRequest: (
    method: string,
    outcome: "success" | "failure",
    durationMs: number,
    attempts: number,
  ) => void;
  updateEndpoint: (snapshot: EndpointSnapshot) => void;
  incrementRateLimited: () => void;
}>;

export const noopMetrics: GatewayMetricsSink = {
  observeAttempt: () => undefined,
  observeRequest: () => undefined,
  updateEndpoint: () => undefined,
  incrementRateLimited: () => undefined,
};

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0") return false;
  if (typeof candidate.method !== "string" || candidate.method.trim() === "")
    return false;
  if (!("id" in candidate)) return true;
  return (
    candidate.id === null ||
    typeof candidate.id === "string" ||
    typeof candidate.id === "number"
  );
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}
