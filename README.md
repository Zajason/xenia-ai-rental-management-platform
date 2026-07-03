# Xenia

> The AI operating system for hospitality. An event-driven operational control
> plane for running multiple short-term rentals — and, later, boutique hotels.

Xenia turns the manual choreography of running rentals (bookings → cleaning →
access codes → guest concierge → maintenance) into a coordinated, observable,
AI-assisted system. Named for the ancient Greek concept of guest-friendship.

## Architecture at a glance

A **modular monolith** for the domain (NestJS) + an extracted **Python AI
service** + **background workers**, wired together by a transactional outbox and
an event bus. One Postgres (with `pgvector` and range-exclusion constraints),
one Redis. See [docs/architecture/overview.md](docs/architecture/overview.md).

```
apps/web ─┐
          ├─▶ apps/api (NestJS gateway + domain modules)
guest ────┘        │  outbox → event bus (Redis Streams)
                   ├─▶ services/workers (workflow engine, scheduler, sync, relay)
                   └─▶ services/ai-concierge (FastAPI: RAG + agent + evals)
                   Postgres + pgvector · Redis · S3 · OpenTelemetry → Grafana
```

## Repository layout

| Path | What lives here |
|------|-----------------|
| `apps/web` | Next.js owner/manager dashboard |
| `apps/guest-concierge` | Magic-link guest concierge surface |
| `apps/cleaner-pwa` | Installable cleaner mobile PWA |
| `apps/api` | NestJS modular monolith (one module per bounded context) |
| `services/ai-concierge` | Python FastAPI: RAG, agent, tools, evals |
| `services/workers` | BullMQ consumers: workflow engine, scheduler, channel sync, outbox relay |
| `packages/db` | Drizzle schema, migrations, RLS policies, seed |
| `packages/shared` | Shared TS types, enums, zod schemas |
| `packages/event-contracts` | The event catalog (source of truth for the bus) |
| `packages/sdk` | Typed API client used by the frontends |
| `packages/ui` | Shared React component library |
| `packages/config` | Shared tsconfig / tooling presets |
| `infra` | Terraform (AWS target), Dockerfiles, local Compose stack |
| `simulation` | Channel / guest / cleaner / lock simulators + scenarios |
| `docs` | Architecture, ADRs, API + event docs, runbooks |
| `tests` | Integration, contract, e2e, load, AI-eval suites |
| `scripts` | Dev bootstrap, seed, migrate helpers |

## Quick start

```bash
# 0. prerequisites: Node >=20, pnpm 10, Python 3.11, Docker
cp .env.example .env

# 1. install JS deps and bootstrap the Python venv
pnpm install
pnpm run setup:ai        # creates services/ai-concierge/.venv

# 2. bring up Postgres + Redis + OTel/Grafana
pnpm infra:up

# 3. apply the schema (Drizzle migrations + RLS/constraint SQL) and seed
pnpm db:migrate
pnpm db:seed

# 4. run everything
pnpm dev

# 5. exercise the whole platform without a frontend:
#    open http://localhost:4000/console — the internal dev console
#    (scenario runner + request builder + endpoint catalog + request log)
```

## Feature scope (MVP)

See [docs/architecture/scope.md](docs/architecture/scope.md). Notable features
explicitly in scope: booking-conflict prevention (DB-enforced), event-driven
workflow engine, AI concierge with gated tool calls, smart-lock lifecycle,
**rules-based pricing suggestions**, **returning-guest memory**, and a
**multi-language concierge**.

## License

Proprietary — all rights reserved (for now).
