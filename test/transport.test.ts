import { describe, expect, it, vi } from "vitest";
import { EndpointRuntime } from "../src/core/endpoint-pool.js";
import { TransportError } from "../src/core/errors.js";
import { RpcTransport } from "../src/core/transport.js";

const request = { jsonrpc: "2.0", id: 1, method: "getHealth" } as const;

function endpoint(): EndpointRuntime {
  const value = new EndpointRuntime(
    { id: "rpc-1", url: new URL("https://rpc.example") },
    { failureThreshold: 2, openDurationMs: 100 },
  );
  value.tryAcquire();
  return value;
}

describe("RpcTransport", () => {
  it("forwards JSON-RPC and parses the upstream response", async () => {
    const mockedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "healthy" },
          }),
          {
            status: 200,
          },
        ),
    );
    const transport = new RpcTransport(mockedFetch as unknown as typeof fetch);
    const response = await transport.forward(
      endpoint(),
      request,
      "request-1",
      100,
    );
    expect(response.payload).toMatchObject({ result: { status: "healthy" } });
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it("marks server failures as retryable and client failures as non-retryable", async () => {
    const serverTransport = new RpcTransport(
      vi.fn(
        async () => new Response("{}", { status: 503 }),
      ) as unknown as typeof fetch,
    );
    const clientTransport = new RpcTransport(
      vi.fn(
        async () => new Response("{}", { status: 400 }),
      ) as unknown as typeof fetch,
    );
    await expect(
      serverTransport.forward(endpoint(), request, "a", 100),
    ).rejects.toMatchObject({
      retryable: true,
      statusCode: 503,
    });
    await expect(
      clientTransport.forward(endpoint(), request, "b", 100),
    ).rejects.toMatchObject({
      retryable: false,
      statusCode: 400,
    });
  });

  it("rejects invalid JSON and timeouts with typed errors", async () => {
    const invalid = new RpcTransport(
      vi.fn(
        async () => new Response("not-json", { status: 200 }),
      ) as unknown as typeof fetch,
    );
    await expect(
      invalid.forward(endpoint(), request, "a", 100),
    ).rejects.toMatchObject({
      kind: "invalid-response",
    });

    const hangingFetch = vi.fn(
      async (
        _input: URL | RequestInfo,
        init?: RequestInit,
      ): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const timeout = new RpcTransport(hangingFetch as unknown as typeof fetch);
    await expect(
      timeout.forward(endpoint(), request, "b", 5),
    ).rejects.toBeInstanceOf(TransportError);
    await expect(
      timeout.forward(endpoint(), request, "c", 5),
    ).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
