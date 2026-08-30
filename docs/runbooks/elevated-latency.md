# Runbook: elevated RPC latency

## Trigger

The p95 or p99 of `rpc_gateway_request_duration_seconds` exceeds the service objective while error rate remains below the outage threshold.

## Diagnosis

1. Compare end-to-end request latency with per-upstream histograms.
2. Split by RPC method; simulation and ledger queries have different normal costs.
3. Check whether retries are increasing `rpc_gateway_request_attempts`.
4. Inspect active requests and event-loop metrics for gateway saturation.
5. Compare health-probe latency with user-request latency to distinguish provider load from method cost.

## Mitigation

- Reduce traffic to a slow endpoint or temporarily remove it from configuration.
- Add capacity before increasing retry count.
- Tune the request timeout only with trace evidence.
- Apply client caching for safe read methods where freshness requirements allow it.

## Validation

Confirm p50, p95, and p99 recover without a corresponding increase in error rate or provider traffic amplification.
