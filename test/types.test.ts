import { describe, expect, it } from "vitest";
import { isJsonRpcRequest, jsonRpcError } from "../src/core/types.js";

describe("JSON-RPC validation", () => {
  it("accepts requests and notifications", () => {
    expect(
      isJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    ).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "getHealth" })).toBe(
      true,
    );
  });

  it("rejects batches, invalid versions, empty methods, and invalid ids", () => {
    expect(isJsonRpcRequest([])).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: "1.0", method: "getHealth" })).toBe(
      false,
    );
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "" })).toBe(false);
    expect(
      isJsonRpcRequest({ jsonrpc: "2.0", method: "getHealth", id: {} }),
    ).toBe(false);
  });

  it("builds JSON-RPC error objects with optional data", () => {
    expect(jsonRpcError(1, -32603, "error")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "error" },
    });
    expect(
      jsonRpcError(null, -32000, "error", { retry: false }).error.data,
    ).toEqual({
      retry: false,
    });
  });
});
