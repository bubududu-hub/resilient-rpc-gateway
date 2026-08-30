# Threat model

## Assets

- availability of the RPC path;
- upstream credentials embedded in operator-provided URLs;
- client API keys;
- integrity of state-changing transaction submissions;
- telemetry that may reveal operational topology.

## Trust boundaries

The client request body and headers are untrusted. Upstream responses are also untrusted. Endpoint configuration, deployment secrets, and the observability backend are operator-controlled.

## Primary threats and controls

| Threat                           | Control                                                                              | Residual risk                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| SSRF/open proxy                  | Clients cannot provide an upstream URL; startup accepts only configured HTTP(S) URLs | A malicious operator configuration can still target an internal service                                     |
| Retry amplification              | Bounded attempts, exponential backoff, different endpoint per attempt                | Many clients can still create load; ingress limits remain necessary                                         |
| Duplicate transaction submission | `sendTransaction` is never automatically retried                                     | A caller may retry independently and must reconcile results                                                 |
| Credential disclosure            | Metrics and health responses use `rpc-N`; errors are sanitized                       | Process/environment access can expose configuration                                                         |
| API-key leakage                  | Keys are SHA-256 digested before in-memory rate-limit lookup and never logged        | A low-entropy key may still be brute-forced if memory is compromised                                        |
| Oversized request DoS            | Fastify body limit is 1 MiB                                                          | High connection counts require ingress and OS-level limits                                                  |
| Metric cardinality attack        | Method is the only client-controlled metric label                                    | Attackers can still generate many unique method names; a production policy should normalize unknown methods |
| Malicious upstream JSON          | Bounded timeout and JSON parsing; no upstream body is used as code                   | A valid but very large response is not yet bounded after headers                                            |

## Deferred controls

- TLS termination and authentication at the ingress layer;
- shared/atomic rate limits for multiple replicas;
- egress allowlists and DNS pinning;
- response-size limits;
- method allowlists and per-method budgets;
- signed provenance/SBOM for release images.
