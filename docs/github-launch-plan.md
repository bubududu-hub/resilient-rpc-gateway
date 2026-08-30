# GitHub launch plan

Do not publish the finished repository as one unexplained commit. Use the following real development history.

## Suggested issues

1. `chore: establish strict TypeScript and CI baseline`
2. `feat: add validated JSON-RPC proxy endpoint`
3. `feat: implement health-aware endpoint pool and circuit breaker`
4. `feat: add retry-safety policy for sendTransaction`
5. `feat: expose Prometheus metrics and OTLP traces`
6. `test: add deterministic upstream fault injection`
7. `docs: add ADRs, threat model, and outage runbooks`

## Pull-request sequence

- PR 1: project baseline, request validation, and single-upstream transport;
- PR 2: endpoint pool, retry policy, circuit breaker, and unit tests;
- PR 3: metrics, tracing, health monitor, Docker demo, and integration tests;
- PR 4: threat model, operations documentation, benchmarks, and `v0.1.0` release notes.

Each PR should explain the failure model, include test evidence, and link its issue. Do not manufacture reviews or backdate work. A genuine external review is valuable; a fake second account is not.
