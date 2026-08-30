# ADR-0001: Retry only operations with a safe failure model

- Status: Accepted
- Date: 2026-08-30

## Context

Automatic retries improve availability after timeouts and transient provider failures. A timeout, however, does not prove that an upstream failed to process a request. Repeating a state-changing operation can therefore duplicate effects.

Stellar transaction submission is identified by the JSON-RPC method `sendTransaction`. Although the network may deduplicate a byte-identical transaction by hash, the gateway should not silently rely on that property or encourage callers to assume all writes are retryable.

## Decision

- Retry transport failures for methods other than `sendTransaction`.
- Retry on a different endpoint and never hit the same endpoint twice within one request.
- Do not retry successful HTTP responses containing a JSON-RPC error.
- Return a sanitized `-32001` service error when safe attempts are exhausted.
- Expose the attempt count to clients and telemetry.

## Consequences

- Read availability improves during partial outages.
- Callers retain control over transaction resubmission and reconciliation.
- New state-changing RPC methods must be classified before the retry allowlist is generalized.
- Future versions should replace the single exception with an explicit method policy registry.
