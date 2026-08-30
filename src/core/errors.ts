export type TransportErrorKind =
  "timeout" | "network" | "http" | "invalid-response";

export class TransportError extends Error {
  public constructor(
    message: string,
    public readonly kind: TransportErrorKind,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

export class GatewayUnavailableError extends Error {
  public constructor(
    message: string,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "GatewayUnavailableError";
  }
}
