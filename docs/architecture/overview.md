# Architecture overview

Xenia is a **modular monolith** for the domain (NestJS) plus an extracted
**Python AI service** and **background workers**, wired by a transactional outbox
and an event bus. One Postgres, one Redis. Microservice *discipline* (hard module
boundaries, separate schemas-by-context, an explicit event catalog) with monolith
*operability* (one deploy, one transaction when you need it).

## Runtime units

| Unit | Tech | Responsibility |
|------|------|----------------|
| `apps/api` | NestJS | API gateway + all domain modules |
| `services/workers` | Node/BullMQ | outbox relay, workflow engine, scheduler, sync, pricing |
| `services/ai-concierge` | Python/FastAPI | RAG + tool-calling agent + memory + evals |
| `apps/web` (+ guest, cleaner) | Next.js | UIs |

## The invariants that make it real

1. **No double-booking** — Postgres `EXCLUDE USING gist` on `tstzrange` rejects
   overlapping occupied ranges per unit, even under concurrent channel writes.
2. **Reliable events** — domain write + `outbox` insert in one transaction; the
   relay publishes; consumers are idempotent. At-least-once with no distributed tx.
3. **Tenant isolation** — RLS on every `org_id` table, enforced for the
   non-superuser app role; `withTenant(orgId, …)` sets the GUC per transaction.
4. **Observability** — OpenTelemetry traces follow one booking webhook across
   api → workers → ai-concierge in Grafana Tempo.

## Consistency strategy

Strong consistency *within* a bounded context (transactions + the exclusion
constraint). Eventual consistency *across* contexts (outbox + idempotent
consumers + saga compensation in the workflow engine). Cross-channel calendar
sync is explicitly eventual — conflicts are surfaced, never hidden.

## Data flow: a booking lands

```
channel webhook → booking (persist raw, idempotent) → confirm (booking + block + outbox, 1 tx)
   → outbox relay → bus: booking.confirmed
       → workflow engine: create cleaning task · issue access credential · start pre-arrival
       → scheduler: activate code at check-in, revoke at checkout
       → concierge: brief the guest, answer questions
```
