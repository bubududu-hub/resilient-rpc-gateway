import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config.js";

describe("loadConfig", () => {
  it("parses endpoints and production defaults", () => {
    const config = loadConfig({
      RPC_ENDPOINTS: "https://rpc-a.example, http://rpc-b.example",
    });
    expect(config.endpoints.map(({ id, url }) => [id, url.href])).toEqual([
      ["rpc-1", "https://rpc-a.example/"],
      ["rpc-2", "http://rpc-b.example/"],
    ]);
    expect(config.requestTimeoutMs).toBe(2_500);
    expect(config.maxRetries).toBe(2);
  });

  it("rejects missing, duplicate, and non-HTTP endpoints", () => {
    expect(() => loadConfig({})).toThrow(/RPC_ENDPOINTS/);
    expect(() =>
      loadConfig({
        RPC_ENDPOINTS: "https://same.example,https://same.example",
      }),
    ).toThrow(/duplicates/);
    expect(() => loadConfig({ RPC_ENDPOINTS: "file:///tmp/socket" })).toThrow(
      /HTTP or HTTPS/,
    );
  });

  it("rejects invalid numeric and telemetry configuration", () => {
    expect(() =>
      loadConfig({ RPC_ENDPOINTS: "https://rpc.example", PORT: "zero" }),
    ).toThrow(/PORT/);
    expect(() =>
      loadConfig({
        RPC_ENDPOINTS: "https://rpc.example",
        RATE_LIMIT_CAPACITY: "0",
      }),
    ).toThrow(/RATE_LIMIT_CAPACITY/);
    expect(() =>
      loadConfig({
        RPC_ENDPOINTS: "https://rpc.example",
        OTEL_EXPORTER_OTLP_ENDPOINT: "ftp://collector.example",
      }),
    ).toThrow(/OTEL_EXPORTER/);
  });
});
