# Xenia

> **The AI operating system for hospitality** — an event-driven operational
> control plane for running multiple short-term rentals (and, later, boutique
> hotels). Named for the ancient Greek concept of guest-friendship.

Running rentals isn't hard because of any single task — it's hard because of the
*coordination*: a booking lands on one channel and must block every other
calendar, spin up a cleaning, mint a door code that lives only for the stay,
brief the guest, answer their 11pm "how does the boiler work" question, and turn
a broken AC into a vendor ticket with temporary access. Today that lives in
WhatsApp groups and spreadsheets. **Xenia turns it into a coordinated,
observable, AI-assisted system.**

This is a real distributed-systems + AI codebase, not a CRUD demo: DB-enforced
booking invariants, a transactional-outbox event bus, multi-tenant Row-Level
Security, a retrieval-augmented AI concierge with provider-swappable models, and
every external system (channels, payments, locks, messaging) behind a port with a
working simulator so the whole platform runs end-to-end offline.

---

## Table of contents

- [Architecture](#architecture)
- [The invariants that make it real](#the-invariants-that-make-it-real)
- [How a request flows](#how-a-request-flows) · [How an event flows](#how-an-event-flows)
- [The domain (bounded contexts)](#the-domain-bounded-contexts)
- [The AI layer (RAG + agent)](#the-ai-layer-rag--agent)
- [External APIs & integrations](#external-apis--integrations)
- [Auth & security](#auth--security)
- [Data & the database](#data--the-database)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Environment variables](#environment-variables)
- [Running it locally](#running-it-locally)
- [The dev console](#the-dev-console)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project status](#project-status)

---

## Architecture

Xenia is a **modular monolith** for the domain, plus two extracted services with
different runtime profiles, wired together by a **transactional outbox** and an
**event bus**. One Postgres, one Redis. Microservice *discipline* (hard module
boundaries, an explicit event catalog, schema-per-context) with monolith
*operability* (one deploy, local transactions where invariants demand them).

```
   Browser / guest / cleaner
            │  HTTPS + JWT
            ▼
 ┌──────────────────────────────────────────────┐        ┌─────────────────────────┐
 │  apps/api  ·  NestJS modular monolith (:4000) │  HTTP  │  services/ai-concierge  │
 │  gateway + ~16 bounded-context modules         │ ─────▶ │  Python / FastAPI (:8000)│
 │  auth · property · kb · booking · calendar ·   │        │  RAG ingest + retrieval │
 │  messaging · concierge · access · tasks ·      │        │  tool-calling agent     │
 │  maintenance · notification · pricing ·        │        │  provider-swappable LLM │
 │  workflow · audit · billing · console          │        └─────────────────────────┘
 └───────────────┬──────────────────────────────┘                    │
                 │ writes business row + outbox row (one transaction) │ reads
                 ▼                                                    ▼
        ┌──────────────────┐   outbox relay    ┌──────────────────────────────────┐
        │  Postgres 16     │ ◀──────────────── │  services/workers · Node (BullMQ) │
        │  + pgvector      │ ───────────────▶  │  outbox relay · workflow engine · │
        │  + RLS + EXCLUDE │   domain events   │  access scheduler · pricing sweep │
        └──────────────────┘                   └──────────────┬───────────────────┘
                 ▲                                             │ publish/consume
                 │                                             ▼
            Redis 6399  ◀────────────── Redis Streams event bus (xenia:events:*)

        OpenTelemetry (traces) ─▶ OTel Collector ─▶ Tempo ─▶ Grafana   (opt-in)
```

Three runtime units, not fourteen microservices:

| Unit | Tech | Port | Responsibility |
|------|------|------|----------------|
| **`apps/api`** | NestJS (TypeScript, CommonJS) | 4000 | API gateway + all domain logic; Swagger at `/docs`, dev console at `/console` |
| **`services/ai-concierge`** | Python / FastAPI | 8000 | RAG ingestion + retrieval, the tool-calling agent, provider-swappable LLM/embeddings |
| **`services/workers`** | Node / BullMQ + Redis Streams | — | Outbox relay, workflow engine, access scheduler, pricing sweep |

Design rationale is recorded in [docs/architecture/adr/0001-modular-monolith.md](docs/architecture/adr/0001-modular-monolith.md);
full walkthrough in [docs/architecture/code-tour.md](docs/architecture/code-tour.md).

---

## The invariants that make it real

These are the load-bearing correctness properties — enforced by the database, not
by hopeful application code:

1. **No double-booking — ever.** `availability_blocks` carries a Postgres
   exclusion constraint `EXCLUDE USING gist (unit_id WITH =, tstzrange(check_in,
   check_out, '[)') WITH &&)`. Two channels racing for the same nights: the second
   `INSERT` fails at the DB with `23P01`, which the API maps to HTTP `409`.
   Same-day turnovers (checkout == next check-in) are allowed via the half-open range.
2. **Reliable events without distributed transactions.** A domain write and its
   `outbox` row commit in the *same* transaction; a relay publishes to Redis
   Streams and marks it published. At-least-once delivery + idempotent consumers.
3. **Tenant isolation, defense-in-depth.** Row-Level Security on every `org_id`
   table; the API connects as a non-superuser role, so a forgotten `WHERE` cannot
   leak across tenants. `withTenant(orgId, fn)` sets the tenant GUC per transaction.
4. **The AI never breaks the product.** Every retrieval/LLM failure (rate limit,
   outage, bad key) degrades to a **human handoff**, never a 500.
5. **Idempotent webhook ingestion.** Inbound channel/billing events are persisted
   by provider event id first; duplicates are no-ops.

---

## How a request flows

Every `apps/api` request passes, in order:

1. **`main.ts`** — starts OpenTelemetry, then Nest + CORS + Swagger.
2. **`JwtAuthGuard`** (global) — verifies the Bearer access token unless the route
   is `@Public()`; attaches `req.user = { userId, orgId, role, scope }` and `req.orgId`.
3. **`RolesGuard`** (global) — enforces `@Roles(...)`; `owner`/`admin` pass any check.
4. **Controller** — body validated by a per-route `ZodValidationPipe`; params by `ParseUUIDPipe`.
5. **Service** — all DB access via `withTenant(orgId, …)` so RLS scopes it.
6. **`DomainErrorFilter`** — maps typed errors (e.g. `BookingConflictError` → 409).

## How an event flows

```
booking confirmed  →  bookings + availability_block + outbox row   (one transaction)
                   →  outbox relay publishes to  xenia:events:booking.confirmed
                   →  workflow engine consumes → runs the org's matching workflow:
                        · create cleaning task   · issue pending access credential
                        · start pre-arrival sequence
                   →  access scheduler activates the code at check-in, expires it at checkout
```

The event catalog is defined once, as zod schemas, in
[`packages/event-contracts`](packages/event-contracts/src/index.ts) — the contract
that keeps producers and consumers honest.

---

## The domain (bounded contexts)

One NestJS module per context under `apps/api/src/modules/` (identity/auth under
`apps/api/src/auth`). Modules talk via injected services or the event bus — never
by reading another context's tables.

| Module | What it does |
|--------|--------------|
| **auth** | orgs, users, memberships, RBAC, JWT + rotating refresh tokens, magic links, invitations |
| **property** | properties, units, amenities, **typed facts** (wifi/parking/…), house rules |
| **kb** | knowledge-base documents + the trigger that (re)builds the AI's searchable index |
| **booking** + **channels** | channel-normalized bookings; idempotent webhook ingestion; conflict handling |
| **calendar** | availability blocks, holds, availability queries |
| **messaging** | omnichannel guest conversations; inbound guest messages auto-invoke the concierge |
| **concierge** | gateway to the Python AI service; degrades to human handoff on any failure |
| **access** | smart-lock credential lifecycle behind a `LockProvider` port (simulator/Seam) |
| **tasks** | staff, cleaning/turnover tasks, cleaner accept/complete → unit ready |
| **maintenance** | vendors, tickets, vendor visits with time-boxed access grants |
| **notification** | one fan-out point (email/SMS/WhatsApp/push) behind a provider port |
| **pricing** | rules-based, explainable pricing suggestions (engine in `@xenia/shared`) |
| **workflow** | CRUD + run inspection over the workers' workflow engine |
| **audit** | append-only, tenant-scoped record of every state change (owner-only reads) |
| **billing** | Stripe-shaped subscriptions **and** in-app payouts to cleaners/vendors |

Cross-cutting features explicitly in scope: **rules-based pricing**,
**returning-guest memory**, and a **multi-language concierge**.

---

## The AI layer (RAG + agent)

`services/ai-concierge` owns everything AI. It answers guest questions with
**retrieval-augmented generation**: retrieve the few facts relevant to *this*
unit, then have an LLM write a grounded reply.

**Write side — ingestion** (`app/rag/ingest.py`): the owner's `property_facts` +
`kb_documents` are chunked, embedded, and stored in `kb_chunks` (pgvector, HNSW
index). Runs on unit setup and on every edit (delete-then-insert = idempotent),
**not per message** — triggered from the API when a fact/doc changes, via
`POST /kb/reindex` / `/kb/reindex-org`.

**Read side — retrieval** (`app/rag/retriever.py`): vector search **always
filtered by `org_id` + `unit_id`** (a guest at unit A can never retrieve unit B's
door code — correctness *and* security), plus org-shared docs.

**The agent** (`app/agent/`): risk guardrails (money/security/emergency keywords
escalate before the model) → retrieve → generate with **gated tool calls** (read
tools auto-run; write tools like `create_maintenance_ticket` or `escalate_to_host`
are policy-gated) → returning-guest memory → multi-language reply. **Any failure
degrades to a human handoff.** It runs fully offline (stub embeddings +
retrieval-only answers) when no keys are set.

**Providers are swappable and independent** — see
[external APIs](#external-apis--integrations) below.

---

## External APIs & integrations

**Philosophy:** every external system sits behind a **port** with a working
**simulator**, so the entire platform runs end-to-end with zero third-party
accounts. Going live means implementing one adapter — nothing else changes.

| Capability | Provider(s) | Status | Key env |
|------------|-------------|--------|---------|
| **LLM (chat/generation)** | **OpenAI `gpt-4o-mini`** (default) · Anthropic Claude | 🟢 live, swappable | `LLM_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| **Embeddings** | **Voyage `voyage-3`** (default) · OpenAI `text-embedding-3-small` | 🟢 live, swappable | `EMBEDDING_PROVIDER`, `VOYAGE_API_KEY` |
| **Channel managers** | Airbnb · Booking.com · Vrbo | 🟡 simulated (webhook adapter) | per-channel webhook secret |
| **Payments — subscriptions** | Stripe Billing | 🟡 simulated | `STRIPE_SECRET_KEY`, `BILLING_WEBHOOK_SECRET` |
| **Payments — payouts** | Stripe Connect | 🟡 simulated | `STRIPE_CONNECT_CLIENT_ID` |
| **Smart locks** | Seam (August/Yale/Nuki/…) | 🟡 simulated (`LockProvider`) | `LOCK_PROVIDER`, `SEAM_API_KEY` |
| **Guest messaging** | WhatsApp · Viber · SMS · email · push | 🟡 simulated | `TWILIO_*`, `WHATSAPP_FROM`, `SMTP_URL` |
| **Observability** | OpenTelemetry → Tempo/Grafana | 🟢 opt-in | `OTEL_EXPORTER_OTLP_ENDPOINT` |

### LLM & embeddings (live today)

Two **independent** choices, each behind a port (`app/llm/`, `app/rag/embeddings.py`):

- **Chat** = the "writer". `LLM_PROVIDER=openai` (default, `gpt-4o-mini`) or
  `anthropic`. Swap with one env var; no code change.
- **Embeddings** = the "librarian". `EMBEDDING_PROVIDER=voyage` (default) or
  `openai` (`text-embedding-3-small` requested at `dimensions=1024`, so it drops
  into the existing `vector(1024)` column with no migration).

The default deliberately mixes **OpenAI chat + Voyage embeddings**. Two rules:
the embedding provider/model must match between ingest and search, and its output
dimension must equal `EMBED_DIM` (1024). With no keys, both fall back to
deterministic stubs so dev/tests run free and offline.
*(Voyage's free tier is 3 requests/min until you add a payment method — the 200M
free tokens still apply; rapid concierge questions otherwise gracefully hand off.)*

### Channel managers (Airbnb / Booking.com / Vrbo) — simulated

A "channel" is created via `POST /channels` (returns a per-channel webhook
secret). Any provider — the dummy or a real one — posts booking events to
`POST /webhooks/channels/:orgId/:channelId`. The path already guarantees
idempotency (dedupe on provider event id) and **exclusivity** (overlaps rejected
by the DB, surfaced as `booking.conflict_detected` + an audit row, provider still
gets 200). Real operation (Airbnb has **no public API** — partner program or iCal;
Booking.com Connectivity Partner; or a commercial channel manager) is detailed in
**[docs/integrations/channels.md](docs/integrations/channels.md)**.

### Billing & payouts (Stripe) — simulated

Two money flows behind one `PaymentProvider` port
(`apps/api/src/modules/billing/payment.provider.ts`):

- **Subscriptions** — per-unit SaaS billing (`/billing/subscription/checkout`,
  provider webhooks at `/webhooks/billing`). → Stripe Billing in production.
- **In-app payouts** — the owner pays a **cleaner or repair vendor** through the
  app (`/billing/payouts`), optionally linked to the task/ticket. → **Stripe
  Connect** transfers in production (payees onboard as Express accounts; KYC is
  Stripe's job, not yours).

What real operation requires (Checkout, raw-body webhook verification, Connect
onboarding) is in **[docs/integrations/billing.md](docs/integrations/billing.md)**.

### Smart locks — simulated

Access credentials are time-boxed: issued `pending`, activated at check-in,
expired at checkout, fully audited, behind a `LockProvider` interface. The
simulator generates codes and can inject failures; the real path is the
[Seam API](https://seam.co) (abstracts August/Yale/Schlage/Nuki/Igloohome). NFC is
modeled as a credential *type*. Select with `LOCK_PROVIDER=simulator|seam`.

### Guest messaging (WhatsApp / Viber) — simulated

The `notification` module and messaging inbound both sit behind a provider port.
Real operation needs a business messaging provider — WhatsApp Business Platform
(24-hour window + approved templates) and/or Viber Business Messages, ideally via
one omnichannel vendor (Twilio / Vonage / MessageBird / Infobip). Inbound guest
messages create a `message` and auto-invoke the concierge.

### Observability — OpenTelemetry (opt-in)

The API is instrumented with OpenTelemetry; set `OTEL_EXPORTER_OTLP_ENDPOINT` and
run the observability profile (`docker compose --profile observability up -d`) to
follow one booking's trace across api → workers → ai in Grafana Tempo.

---

## Auth & security

- **Staff** (owner/admin/manager/cleaner) log in with email + **argon2id**
  password → a **15-min JWT access token** + a **30-day opaque refresh token**
  stored as a sha256 hash and **rotated on every use** (reuse of a rotated token
  is rejected — theft detection).
- **Guests / vendors / cleaners** never sign up: staff issue **magic links**
  (single-use, hashed) that exchange for a short-lived `scope:'magic'` token.
- **RBAC**: `owner`/`admin` are org superusers; `manager`/`cleaner` are gated per
  route via `@Roles()`. Capability map in `packages/shared/src/roles.ts`.
- **Multi-tenancy**: shared DB + **Row-Level Security** keyed on `org_id`,
  enforced for the non-superuser app role; auth/credential tables
  (`refresh_tokens`, `magic_links`, `invitations`, `api_keys`) are RLS-exempt
  because they're looked up by secret token pre-tenant.
- **Audit**: every significant state change is written append-only to `audit_events`.

---

## Data & the database

PostgreSQL 16 + `pgvector`, Drizzle ORM, schema-per-bounded-context under
[`packages/db/src/schema`](packages/db/src/schema). Migrations run in two passes
(`pnpm db:migrate`): generated table DDL, then hand-written SQL in
`migrations/manual/` (extensions, the exclusion constraint, RLS policies, the
pgvector HNSW index, the two extra roles, auth functions).

**Three database roles** — the #1 thing to know when debugging:

| Role | Used by | RLS |
|------|---------|-----|
| `xenia` | migrations / seed (`DATABASE_ADMIN_URL`) | bypassed (superuser) |
| `xenia_app` | the API + AI service (`DATABASE_URL`) | **enforced** |
| `xenia_worker` | the workers (`WORKER_DATABASE_URL`) | **bypassed** (BYPASSRLS) |

Consequence: worker code must filter by `org_id` **explicitly** — RLS won't scope
it. Seed a demo tenant (`Aegean Stays`) with `pnpm db:seed`.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| API | NestJS 11, zod validation, `@nestjs/jwt`, argon2id, OpenTelemetry |
| ORM / DB | Drizzle + PostgreSQL 16 + pgvector; RLS + range-exclusion constraints |
| Events | Transactional outbox → Redis Streams (→ NATS JetStream at scale) |
| Workers | Node + BullMQ + Redis |
| AI | Python / FastAPI; OpenAI / Anthropic (chat) · Voyage / OpenAI (embeddings) |
| Web | Next.js 15 / React 19 (dashboard) |
| Monorepo | pnpm workspaces + Turborepo |
| Tests | Vitest + supertest (TS, SWC for Nest DI) · pytest (Python) |
| Infra | Docker Compose (local) · Terraform (AWS target) · GitHub Actions CI |

---

## Repository layout

| Path | What lives here |
|------|-----------------|
| `apps/api` | NestJS modular monolith — the gateway + all domain modules + the dev console |
| `apps/web` | Next.js owner/manager dashboard (placeholder UI today) |
| `apps/guest-concierge`, `apps/cleaner-pwa` | planned magic-link guest surface + cleaner PWA (spec only) |
| `services/ai-concierge` | Python FastAPI: RAG ingest/retrieval, agent, LLM/embedding providers, evals |
| `services/workers` | outbox relay, workflow engine, access scheduler, pricing sweep |
| `packages/db` | Drizzle schema, migrations, RLS/constraint SQL, seed, the `withTenant` client |
| `packages/shared` | shared TS: roles, errors, languages, the pure pricing engine |
| `packages/event-contracts` | the event catalog (zod) — source of truth for the bus |
| `packages/sdk`, `packages/ui`, `packages/config` | typed API client, shared React components, tsconfig presets |
| `infra` | Compose stack (Postgres/Redis/OTel/Tempo/Grafana), Dockerfiles, Terraform |
| `simulation` | channel/guest/cleaner/lock simulators + seedable scenarios |
| `docs` | architecture, ADRs, code tour, integration guides, runbooks |
| `tests` | cross-cutting integration / contract / e2e / load / AI-eval suites |

---

## Environment variables

Copy `.env.example` → `.env` and fill in. **Real secrets go in `.env` only**
(it's gitignored); never in `.env.example`. Full annotated list is in
[`.env.example`](.env.example); the essentials:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | app connection (role `xenia_app`, RLS enforced) — `…@localhost:5442/xenia` |
| `DATABASE_ADMIN_URL` | migrations/seed (role `xenia`) |
| `WORKER_DATABASE_URL` | workers (role `xenia_worker`, BYPASSRLS) |
| `REDIS_URL` | `redis://localhost:6399` |
| `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS` | auth token signing + lifetimes |
| `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` | chat provider (default openai / gpt-4o-mini) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_AGENT_MODEL` | chat provider when `LLM_PROVIDER=anthropic` |
| `EMBEDDING_PROVIDER`, `VOYAGE_API_KEY`, `EMBED_DIM` | embeddings (default voyage / 1024 dims) |
| `AI_CONCIERGE_URL` | where the API reaches the Python service (`http://localhost:8000`) |
| `BILLING_WEBHOOK_SECRET`, `STRIPE_*` | billing (dummy secret until Stripe) |
| `LOCK_PROVIDER`, `SEAM_API_KEY` | smart locks |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | tracing (leave blank to disable) |

> **Note on ports:** local Postgres is **5442** and Redis is **6399** (remapped
> from the defaults to avoid clashing with other local stacks). CI uses the
> standard 5432/6379 via its own env.

---

## Running it locally

**Prerequisites:** Node ≥ 20, pnpm 10, Python 3.11, Docker.

```bash
# 0. configure
cp .env.example .env          # add OPENAI_API_KEY + VOYAGE_API_KEY for real AI answers

# 1. install JS deps + bootstrap the Python venv
pnpm install
pnpm run setup:ai             # creates services/ai-concierge/.venv

# 2. bring up Postgres + Redis (add --profile observability for OTel/Grafana)
pnpm infra:up

# 3. schema + demo data
pnpm db:migrate
pnpm db:seed

# 4. run the services (separate terminals)
pnpm --filter @xenia/api dev        # API + console  → http://localhost:4000
pnpm run dev:ai                     # AI concierge   → http://localhost:8000
pnpm --filter @xenia/workers dev    # background workers

# 5. drive the whole platform without a frontend:
open http://localhost:4000/console
```

Ports: API **4000** · AI **8000** · web **3000** · Postgres **5442** · Redis
**6399** · Grafana **3001** · Tempo **3200**. API docs (Swagger) at
`http://localhost:4000/docs`.

---

## The dev console

An internal tool served by the API at **`/console`** (dev-gated). It exercises
every module without a frontend or curl:

- **Session** — one-click "Bootstrap demo organization" + login/refresh/logout;
  separate owner/cleaner/guest tokens.
- **Service health** — live API/AI reachability + which chat/embedding providers
  and keys are configured (via `GET /console/status`).
- **Workloads** — 10 chained scenarios (estate setup → Airbnb booking → channel
  conflict → cleaner turnover → door-code lifecycle → **stock the knowledge base**
  → **guest asks the concierge** → maintenance + vendor payout → pricing →
  subscription + cleaner payout), each with live step logs. "▶ Run all" chains them.
- **AI Concierge panel** — the live RAG answer as chat bubbles + an interactive
  "ask as the guest" box.
- **Request builder** + **endpoint catalog** (88 endpoints, `{{var}}` substitution
  from scenario context) + a status-coloured **request log**.

Hidden in production unless `ENABLE_DEV_CONSOLE=true`.

---

## Testing

~**100+ tests**, all against real Postgres/Redis (no heavy mocking):

```bash
pnpm test                                    # all TS suites (api + workers)
pnpm --filter @xenia/api test                # API e2e (auth, channels, access, billing, kb, …)
pnpm --filter @xenia/workers test            # workflow engine, outbox relay, scheduler, pricing
services/ai-concierge/.venv/bin/python -m pytest services/ai-concierge/tests   # RAG ingest/retrieve, agent, providers
```

Coverage highlights: the booking-exclusivity/conflict path, RBAC denials + cross-
tenant isolation, refresh-token rotation/theft, the KB embedding lifecycle
(create/add/edit/delete → reindex), and the concierge's graceful-degradation
paths. TS uses Vitest (SWC so Nest DI metadata is emitted); Python uses pytest
(offline/deterministic — a fake LLM provider + stub embeddings).

---

## Deployment

- **Local / CI**: the Docker Compose stack in `infra/compose`. CI
  (`.github/workflows/ci.yml`) spins up Postgres + Redis, migrates, seeds, then
  typechecks/builds/tests the TS workspace and runs the Python suite.
- **Production target**: `infra/docker` has per-service Dockerfiles;
  `infra/terraform` sketches the AWS path (ECS Fargate, RDS Postgres, ElastiCache,
  S3, Secrets Manager). The MVP can also deploy to Fly.io/Railway.

---

## Project status

**Solid and tested:** the data + security layer, auth, all domain modules, the
event-driven spine (outbox → workers → workflow fan-out), the AI concierge (RAG
ingest + retrieval + provider-swappable generation with graceful degradation), and
the dev console.

**Simulated behind ports (documented, not yet real):** channel managers, Stripe
billing/payouts, smart locks, and WhatsApp/Viber messaging.

**Planned:** the production frontends (`apps/web` is a placeholder; guest &
cleaner surfaces are spec-only), saga compensation in the workflow engine, and
first real adapters for the integrations above.

See [docs/architecture/roadmap.md](docs/architecture/roadmap.md) and
[docs/architecture/code-tour.md](docs/architecture/code-tour.md) for detail.

---

## License

Proprietary — all rights reserved (for now).
