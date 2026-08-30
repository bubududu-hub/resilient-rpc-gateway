# Contributing

## Development workflow

1. Open or select an issue and describe the failure mode or user outcome.
2. Create a focused branch such as `feat/health-aware-routing`.
3. Add or update tests before changing behavior.
4. Run `npm run check` locally.
5. Submit a PR with risk, rollback, and validation notes.

## Design expectations

- Never log upstream URLs, API keys, transaction payloads, or secrets.
- State-changing methods require an explicit retry-safety decision.
- New metric labels must have bounded cardinality.
- Time-based behavior must accept an injected clock or be testable deterministically.
- Operational changes require a matching runbook or ADR update.

## Commit style

Use concise conventional prefixes: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, and `chore:`.
