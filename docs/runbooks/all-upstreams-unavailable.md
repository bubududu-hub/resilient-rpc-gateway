# Runbook: all RPC upstreams unavailable

## Trigger

- `/ready` returns `503`;
- `rpc_gateway_endpoint_circuit_state` is `2` for every endpoint;
- client error rate for code `-32001` is elevated.

## Immediate checks

1. Confirm whether the failure affects all methods or one RPC method.
2. Inspect endpoint circuit state, score, attempt count, and upstream latency metrics.
3. Query each upstream's `getHealth` endpoint from the same network segment as the gateway.
4. Check DNS, TLS expiry, egress policy, provider status, and account quota.
5. Correlate gateway request IDs with traces; do not paste credential-bearing URLs into tickets.

## Mitigation

- Remove a consistently invalid endpoint from `RPC_ENDPOINTS` and deploy configuration.
- Add a previously approved provider if capacity policy permits.
- Increase timeouts only when traces prove healthy work is completing just beyond the current deadline.
- Do not enable retries for `sendTransaction` as an outage workaround.

## Recovery validation

- At least one endpoint returns `status: healthy` from `getHealth`.
- Its circuit passes a half-open probe and returns to `closed`.
- `/ready` returns `200` and `-32001` errors return to baseline.
- Verify `getNetwork` before resuming transaction traffic to prevent a network mismatch.

## Follow-up

Record impact, detection gap, provider behavior, configuration change, and whether retry traffic amplified the incident.
