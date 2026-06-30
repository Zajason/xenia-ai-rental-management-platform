# tests/

Cross-cutting test suites that span more than one package. Unit tests live next
to the code they test; everything here exercises the system as a whole.

- **integration/** — multi-module flows against a real Postgres/Redis (e.g.
  "a confirmed booking creates a cleaning task and an access credential").
- **contract/** — event- and API-contract tests that assert producers and
  consumers agree with `@xenia/event-contracts` and the OpenAPI spec.
- **e2e/** — Playwright browser tests over the web dashboard and guest concierge.
- **load/** — k6 scripts that hammer the booking-ingestion + conflict path and
  publish results.
- **ai-eval/** — the AI evaluation harness: labeled datasets + scorers
  (groundedness, retrieval hit-rate, tool-selection, escalation precision). Runs
  in CI and gates merges.
