import { TransportError } from "./errors.js";
import type { EndpointRuntime } from "./endpoint-pool.js";
import type { JsonRpcRequest } from "./types.js";

export type FetchLike = typeof fetch;

export type TransportResponse = Readonly<{
  statusCode: number;
  payload: unknown;
}>;

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

export class RpcTransport {
  public constructor(private readonly fetchImplementation: FetchLike = fetch) {}

  public async forward(
    endpoint: EndpointRuntime,
    request: JsonRpcRequest,
    requestId: string,
    timeoutMs: number,
  ): Promise<TransportResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetchImplementation(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const body = await response.text();
      let payload: unknown = null;
      if (body !== "") {
        try {
          payload = JSON.parse(body) as unknown;
        } catch {
          throw new TransportError(
            "Upstream returned invalid JSON",
            "invalid-response",
            true,
          );
        }
      }

      if (!response.ok) {
        throw new TransportError(
          `Upstream returned HTTP ${String(response.status)}`,
          "http",
          isRetryableStatus(response.status),
          response.status,
        );
      }

      return { statusCode: response.status, payload };
    } catch (error) {
      if (error instanceof TransportError) throw error;
      if (controller.signal.aborted) {
        throw new TransportError("Upstream request timed out", "timeout", true);
      }
      throw new TransportError(
        "Upstream network request failed",
        "network",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
