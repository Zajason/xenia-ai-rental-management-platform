# infra/compose — local dev stack

`pnpm infra:up` starts:

| Service | Port | Purpose |
|---------|------|---------|
| postgres (pgvector) | 5432 | primary DB; `initdb/` creates extensions + the app role |
| redis | 6379 | cache, BullMQ, the Redis-Streams event bus |
| otel-collector | 4317/4318 | receives OTLP traces from all services |
| tempo | 3200 | trace storage |
| grafana | 3001 | trace explorer (anonymous admin, no login) |

Open Grafana at http://localhost:3001 → Explore → Tempo to follow a booking's
trace across api → workers → ai-concierge.
