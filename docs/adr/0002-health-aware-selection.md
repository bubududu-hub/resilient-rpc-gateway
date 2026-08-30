# ADR-0002: Select endpoints with local health signals

- Status: Accepted
- Date: 2026-08-30

## Context

Round-robin treats a fast healthy endpoint and a slow failing endpoint as equivalent. A pure latency policy can overload one provider and has no recovery mechanism after failures.

## Decision

Maintain an in-memory score per endpoint using:

- circuit state;
- observed success ratio;
- exponentially weighted moving-average latency;
- consecutive failures;
- active requests.

Pick the highest-scoring available endpoint, use a random tie-breaker, and exclude endpoints already attempted for the current request. Open circuits become eligible for a single half-open probe after their cooldown.

## Consequences

- Requests move away from slow or failing providers without a centralized coordinator.
- Scores are process-local and reset after deployment.
- Several replicas may make different choices, which is acceptable for the MVP.
- Production tuning should be driven by SLO data rather than arbitrary score weights.
