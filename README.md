<div align="center">

# Xenia

**The AI operating system for hospitality.**

An event-driven operational control plane for running multiple short-term
rentals — bookings, cleaning, maintenance, access, pricing and a
retrieval-grounded AI concierge, coordinated as one system.

*Named for ξενία, the ancient Greek code of guest-friendship.*

[Architecture](#architecture) · [Product tour](#product-tour) · [The AI layer](#the-ai-layer-rag--agent) · [Engineering decisions](#six-engineering-decisions-worth-explaining) · [Run it locally](#running-it-locally) · [Status](#project-status)

</div>

![Owner dashboard](docs/images/dashboard.png)

---

Running rentals isn't hard because of any single task — it's hard because of the
*coordination*. A booking lands on one channel and must block every other
calendar, spin up a cleaning, mint a door code that lives only for the stay,
brief the guest, answer their 11pm "how does the boiler work" question, and turn
a broken AC into a vendor ticket with temporary access. Today that lives in
WhatsApp groups and spreadsheets.

**Xenia turns it into a coordinated, observable, AI-assisted system.**

This is a distributed-systems + AI codebase, not a CRUD demo: double-bookings are
impossible *at the database*, events survive crashes via a transactional outbox,
tenants are isolated by Row-Level Security rather than by careful `WHERE` clauses,
the concierge is grounded in a per-unit vector index, and every external system
sits behind a port with a working simulator — so the whole platform runs
end-to-end offline, with no third-party account.

<table>
<tr>
<td width="33%" valign="top">

**110 automated tests**
against real Postgres + Redis — no mocked database

</td>
<td width="33%" valign="top">

**3 runtime units**
NestJS monolith · Python AI service · Node workers

</td>
<td width="33%" valign="top">

**16 bounded contexts**
hard module boundaries, one explicit event catalog

</td>
</tr>
</table>

---

## Table of contents

- [Product tour](#product-tour)
- [Architecture](#architecture)
- [The invariants that make it real](#the-invariants-that-make-it-real)
- [How a booking flows through the system](#how-a-booking-flows-through-the-system)
- [The domain (bounded contexts)](#the-domain-bounded-contexts)
- [The AI layer (RAG + agent)](#the-ai-layer-rag--agent)
- [Six engineering decisions worth explaining](#six-engineering-decisions-worth-explaining)
- [The frontend](#the-frontend)
- [External APIs & integrations](#external-apis--integrations)
- [Auth & security](#auth--security)
- [Data & the database](#data--the-database)
- [Tech stack](#tech-stack) · [Repository layout](#repository-layout)
- [Environment variables](#environment-variables)
- [Running it locally](#running-it-locally)
- [The dev console](#the-dev-console)
- [Testing](#testing) · [Deployment](#deployment) · [Project status](#project-status)

---

## Product tour

Every screen below is reading live data from the API — there is no mocked or
sample content anywhere in the frontend.

### The AI concierge, grounded in the owner's own house manual

A guest asks over WhatsApp; the concierge retrieves from *that unit's* index and
answers. It never invents a door code, and it never answers from another unit's
knowledge.

![AI concierge answering from the knowledge base](docs/images/ai-concierge-thread.png)

When retrieval doesn't support an answer, it says so and offers a human — in the
guest's own language, detected from the message. Here a Swedish guest asks about
a beach the knowledge base has nothing on:

![Concierge declining to guess and offering a handoff](docs/images/ai-concierge-handoff.png)

> This is the behaviour that makes an AI concierge shippable. A model that
> confidently invents a check-in time is worse than no concierge at all.

### The knowledge base behind it

Facts and documents are chunked, embedded and stored per unit. The owner sees
exactly how much the concierge can actually retrieve.

![Unit knowledge base with live chunk count](docs/images/unit-knowledge-base.png)

### Explainable pricing

Rules produce suggestions with their reasoning attached — never an opaque number.
Nothing changes a rate until a human accepts it.

![Pricing rules and suggestions](docs/images/pricing.png)

### Bookings from every channel, in one calendar

![Bookings](docs/images/bookings.png)

### The rest of the operation

<table>
<tr>
<td width="50%"><img src="docs/images/tasks.png" alt="Tasks"><br><sub><b>Tasks</b> — turnovers assigned to cleaners, accept/complete from the field</sub></td>
<td width="50%"><img src="docs/images/maintenance.png" alt="Maintenance"><br><sub><b>Maintenance</b> — tickets, vendors, and time-boxed access grants for visits</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/guests.png" alt="Guests"><br><sub><b>Guests</b> — a real directory with returning-guest memory</sub></td>
<td width="50%"><img src="docs/images/billing.png" alt="Billing"><br><sub><b>Billing</b> — metered subscription + in-app payouts to cleaners and vendors</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/team.png" alt="Team"><br><sub><b>Team</b> — invitations issued as one-time tokens, roles mirroring the API</sub></td>
<td width="50%"><img src="docs/images/audit.png" alt="Audit log"><br><sub><b>Audit log</b> — append-only record of every write, including the AI's</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/properties.png" alt="Properties"><br><sub><b>Properties</b> — portfolio down to per-unit facts, knowledge and access</sub></td>
<td width="50%"><img src="docs/images/messages.png" alt="Messages"><br><sub><b>Messages</b> — every guest conversation across WhatsApp, SMS, email and in-app</sub></td>
</tr>
</table>

### Getting in

Signup mirrors the two mechanisms the backend actually has — register an
organization, or accept an invitation — and an owner is walked straight into
creating their first property.

<table>
<tr>
<td width="33%"><img src="docs/images/login.png" alt="Login"><br><sub><b>Login</b></sub></td>
<td width="33%"><img src="docs/images/signup.png" alt="Signup"><br><sub><b>Role-aware signup</b></sub></td>
<td width="33%"><img src="docs/images/onboarding.png" alt="Onboarding"><br><sub><b>First property</b></sub></td>
</tr>
</table>

---

## Architecture

Xenia is a **modular monolith** for the domain, plus two extracted services with
genuinely different runtime profiles, wired together by a **transactional
outbox** and an event bus. One Postgres, one Redis. Microservice *discipline*
(hard module boundaries, an explicit event catalog, schema-per-context) with
monolith *operability* (one deploy, local transactions where invariants demand
them).

```mermaid
flowchart TB
    subgraph clients [ ]
        direction LR
        OWNER["Owner dashboard<br/><i>Next.js 15</i>"]
        GUEST["Guest<br/><i>magic link</i>"]
        CHAN["Channel webhooks<br/><i>Airbnb · Booking.com</i>"]
    end

    API["<b>apps/api</b> · NestJS modular monolith :4000<br/>16 bounded contexts · JWT + RBAC + RLS<br/>Swagger /docs · dev console /console"]

    AI["<b>services/ai-concierge</b> · FastAPI :8000<br/>RAG ingest + retrieval<br/>tool-calling agent<br/>swappable LLM / embeddings"]

    WORK["<b>services/workers</b> · Node + BullMQ<br/>outbox relay · workflow engine<br/>access scheduler · pricing sweep"]

    PG[("<b>Postgres 16</b> + pgvector<br/>RLS · EXCLUDE constraint<br/>outbox · kb_chunks")]
    REDIS[("<b>Redis</b><br/>Streams event bus<br/>xenia:events:*")]

    OWNER -->|HTTPS + JWT| API
    GUEST -->|scope:magic token| API
    CHAN -->|signed webhook| API

    API <-->|HTTP| AI
    API -->|business row + outbox row<br/><b>one transaction</b>| PG
    AI -->|vector search<br/>scoped to org + unit| PG

    PG -.->|relay polls outbox| WORK
    WORK -->|publish| REDIS
    REDIS -->|consume| WORK
    WORK -->|BYPASSRLS role| PG

    classDef svc fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
    classDef store fill:#0f172a,stroke:#64748b,color:#e2e8f0
    class API,AI,WORK svc
    class PG,REDIS store
```

Three runtime units, not fourteen microservices:

| Unit | Tech | Port | Responsibility |
|------|------|------|----------------|
| **`apps/api`** | NestJS (TypeScript) | 4000 | API gateway + all domain logic; Swagger at `/docs`, dev console at `/console` |
| **`services/ai-concierge`** | Python / FastAPI | 8000 | RAG ingestion + retrieval, the tool-calling agent, provider-swappable LLM/embeddings |
| **`services/workers`** | Node / BullMQ + Redis Streams | — | Outbox relay, workflow engine, access scheduler, pricing sweep |

**Why the AI service is separate but the domain is not.** Splitting by *runtime
profile* rather than by entity: Python owns AI because that's where the ecosystem
lives, and it scales on a different axis (GPU-ish, bursty, latency-tolerant) than
CRUD. The domain modules stay in one process because their invariants —
"block the calendar and create the task and write the outbox row" — want a local
transaction, and distributing that would buy nothing but sagas.

Rationale recorded in
[ADR 0001](docs/architecture/adr/0001-modular-monolith.md); full walkthrough in
[the code tour](docs/architecture/code-tour.md).

---

## The invariants that make it real

The load-bearing correctness properties — enforced by the database, not by
hopeful application code:

1. **No double-booking, ever.** `availability_blocks` carries a Postgres
   exclusion constraint:
   ```sql
   EXCLUDE USING gist (unit_id WITH =, tstzrange(check_in, check_out, '[)') WITH &&)
   ```
   Two channels racing for the same nights: the second `INSERT` fails at the DB
   with `23P01`, which the API maps to HTTP `409`. Same-day turnovers
   (checkout == next check-in) stay legal via the half-open range.
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

## How a booking flows through the system

One inbound webhook, and the whole operation reacts:

```mermaid
sequenceDiagram
    autonumber
    participant CH as Airbnb webhook
    participant API as apps/api
    participant PG as Postgres
    participant RLY as outbox relay
    participant WF as workflow engine
    participant SCH as access scheduler

    CH->>API: POST /webhooks/channels/:org/:channel
    API->>PG: dedupe on provider event id
    rect rgb(30,41,59)
    note over API,PG: ONE transaction
    API->>PG: insert booking
    API->>PG: insert availability_block (EXCLUDE guards overlap)
    API->>PG: insert outbox row
    end
    API-->>CH: 200 (even on conflict — logged, never retried into a loop)

    RLY->>PG: poll unpublished outbox
    RLY->>WF: publish booking.confirmed

    WF->>PG: create cleaning task
    WF->>PG: issue access credential (pending)
    WF->>PG: start pre-arrival sequence

    SCH->>PG: activate code at check-in
    SCH->>PG: expire code at checkout
```

The event catalog is defined once, as zod schemas, in
[`packages/event-contracts`](packages/event-contracts/src/index.ts) — the
contract that keeps producers and consumers honest.

---

## The domain (bounded contexts)

One NestJS module per context under `apps/api/src/modules/` (identity/auth lives
in `apps/api/src/auth`). Modules talk via injected services or the event bus —
never by reading another context's tables.

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

---

## The AI layer (RAG + agent)

`services/ai-concierge` owns everything AI. It answers guest questions with
**retrieval-augmented generation**: retrieve the few facts relevant to *this*
unit, then have an LLM write a grounded reply.

```mermaid
flowchart LR
    subgraph write ["WRITE SIDE — on edit, not per message"]
        F["property_facts"] --> CH["chunk<br/>500 chars, 60 overlap"]
        D["kb_documents"] --> CH
        CH --> EM["embed<br/><i>Voyage voyage-3</i>"]
        EM --> KC[("kb_chunks<br/>pgvector + HNSW")]
    end

    subgraph read ["READ SIDE — per guest message"]
        Q["guest message"] --> RISK{"risk<br/>guardrails"}
        RISK -->|money · security<br/>emergency| ESC["escalate to human"]
        RISK -->|safe| RET["vector search<br/><b>filtered by org_id + unit_id</b>"]
        RET --> GEN["generate<br/><i>OpenAI gpt-4o-mini</i>"]
        GEN --> TOOLS{"tool call?"}
        TOOLS -->|read tools| AUTO["auto-run"]
        TOOLS -->|write tools| GATE["policy-gated"]
        AUTO --> REPLY["grounded reply<br/>in the guest's language"]
        GATE --> REPLY
    end

    KC -.->|retrieved| RET
    RET -.->|nothing relevant| ESC

    classDef danger fill:#3b1219,stroke:#ef4444,color:#fecaca
    class ESC danger
```

**Write side** (`app/rag/ingest.py`) runs on unit setup and on every edit —
**not per message**. That's what keeps it cheap: embeddings are computed once per
change, not once per question.

**Read side** (`app/rag/retriever.py`): vector search is **always filtered by
`org_id` + `unit_id`**. A guest at unit A can never retrieve unit B's door code —
correctness *and* security in one predicate.

**The agent** (`app/agent/`): risk guardrails run *before* the model
(money/security/emergency keywords escalate immediately) → retrieve → generate
with gated tool calls (read tools auto-run; writes like
`create_maintenance_ticket` are policy-gated) → returning-guest memory →
multi-language reply. Any failure degrades to a human handoff. With no API keys
it still runs, on deterministic stub embeddings and retrieval-only answers.

---

## Six engineering decisions worth explaining

**1. The database enforces exclusivity, not the application.**
The obvious implementation of "don't double-book" is `SELECT` overlapping rows,
then `INSERT` if none. That is a race with a comfortable-looking test suite. The
exclusion constraint makes the invariant true under concurrency by construction;
the application's only job is translating `23P01` into a 409. Correctness moved
from code that runs sometimes to a constraint that always holds.

**2. Transactional outbox instead of "write, then publish".**
Publishing to Redis after committing to Postgres has a failure window: commit
succeeds, publish doesn't, and the cleaning is never created. Writing the event
into an `outbox` table *in the same transaction* makes the event as durable as
the booking. A relay drains it. This trades exactly-once (which doesn't exist)
for at-least-once plus idempotent consumers (which does).

**3. Three database roles, and the trap in the third.**
`xenia` migrates, `xenia_app` serves requests with RLS enforced, `xenia_worker`
runs the workers with `BYPASSRLS` — because a worker draining a cross-tenant
outbox would otherwise see zero rows. The consequence is a real footgun worth
stating loudly: **worker code must filter by `org_id` explicitly**, since the
safety net every other layer relies on is switched off there by design.

**4. Every integration is a port with a working simulator.**
Channels, payments, locks and messaging each sit behind an interface whose
simulator implements the *whole* contract — including failure injection. The
result is that the entire platform runs end-to-end with zero third-party
accounts, tests are deterministic and free, and going live means writing one
adapter rather than touching business logic. The cost is honest: the simulators
prove the flow, not the vendor.

**5. Delete-then-insert is only idempotent if it's serialized.**
Reindexing a unit rebuilds its chunks by deleting then inserting — idempotent by
design. But edits fire reindexes *fire-and-forget*, so adding six facts starts
six concurrent rebuilds; each deletes, then inserts after the others deleted, and
the unit ends up with N copies of every chunk. (Observed in the wild here: 9
writes produced 81 chunks instead of 9.) Duplicate passages then crowd out
diverse ones in top-k retrieval — a *quality* bug wearing a concurrency bug's
clothes. Fixed with a transaction-scoped advisory lock keyed on the scope, so
rebuilds queue instead of interleaving.

**6. An AI feature needs a defined failure mode before it ships.**
"Degrade to human handoff" is written into the concierge at every level: the risk
guardrail escalates before the model sees the message, retrieval returning
nothing relevant escalates rather than inviting the model to improvise, and any
provider error escalates instead of 500-ing. The concierge is allowed to be
unavailable. It is not allowed to be confidently wrong about a door code.

---

## The frontend

`apps/web` is a Next.js 15 / React 19 dashboard wired to the API through the
typed SDK in `packages/sdk`. Every screen reads a real endpoint; empty states
stand in for "this org has nothing yet" rather than sample data.

- **Auth** — password login with a multi-org picker, role-aware signup (register
  an org as owner, or accept an invitation as admin/manager/cleaner), and an
  onboarding wizard that walks a new owner into their first property and unit.
  Guests and vendors deliberately have no password signup: they get magic links.
- **Session handling** lives in the SDK, not the app: a 401 triggers one
  `/auth/refresh` and a retry, and concurrent 401s share a single in-flight
  refresh so the rotating refresh token isn't raced by parallel requests.
- **Role gating mirrors the API.** Nav items and routes are filtered by role, and
  a direct URL a role can't use bounces to the overview instead of spinning on
  403s — while the API remains the actual authority.

Two surfaces remain spec-only: `apps/guest-concierge` (the magic-link guest chat)
and `apps/cleaner-pwa`. Both of their backends are built and tested.

---

## External APIs & integrations

Every external system sits behind a **port** with a working **simulator**, so the
platform runs end-to-end with zero third-party accounts. Going live means
implementing one adapter — nothing else changes.

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

> 🟡 means the *flow* is real, tested and end-to-end — only the outbound vendor
> call is simulated. Each one needs an adapter written behind an existing
> interface; none of them is just "paste an API key".

### LLM & embeddings (live today)

Two **independent** choices, each behind a port (`app/llm/`,
`app/rag/embeddings.py`):

- **Chat** = the "writer". `LLM_PROVIDER=openai` (default) or `anthropic`.
- **Embeddings** = the "librarian". `EMBEDDING_PROVIDER=voyage` (default) or
  `openai` (`text-embedding-3-small` requested at `dimensions=1024`, so it drops
  into the existing `vector(1024)` column with no migration).

The default deliberately mixes **OpenAI chat + Voyage embeddings**. Two rules:
the embedding provider/model must match between ingest and search, and its output
dimension must equal `EMBED_DIM` (1024). With no keys, both fall back to
deterministic stubs so dev and tests run free and offline.

### Channels, billing, locks, messaging

Detailed integration guides:
**[channels](docs/integrations/channels.md)** (Airbnb has no public API — partner
program or iCal; Booking.com Connectivity Partner; or a commercial channel
manager) and **[billing](docs/integrations/billing.md)** (Checkout, raw-body
webhook verification, Connect onboarding for payees).

---

## Auth & security

- **Staff** (owner/admin/manager/cleaner) log in with email + **argon2id**
  password → a **15-min JWT access token** + a **30-day opaque refresh token**
  stored as a sha256 hash and **rotated on every use** (reuse of a rotated token
  is rejected — theft detection).
- **Guests / vendors** never sign up: staff issue **magic links** (single-use,
  hashed) that exchange for a short-lived `scope:'magic'` token.
- **RBAC**: `owner`/`admin` are org superusers; `manager`/`cleaner` are gated per
  route via `@Roles()`. Capability map in `packages/shared/src/roles.ts`.
- **Multi-tenancy**: shared DB + **Row-Level Security** keyed on `org_id`. The
  `org_id` is baked into the JWT, so no client ever supplies it. Auth tables
  (`refresh_tokens`, `magic_links`, `invitations`, `api_keys`) are RLS-exempt
  because they're looked up by secret token *before* a tenant is known.
- **Audit**: every significant state change is written append-only to
  `audit_events` — including actions taken by the AI, tagged as such.

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

---

## Tech stack

| Layer | Choice |
|-------|--------|
| API | NestJS 11, zod validation, `@nestjs/jwt`, argon2id, OpenTelemetry |
| ORM / DB | Drizzle + PostgreSQL 16 + pgvector; RLS + range-exclusion constraints |
| Events | Transactional outbox → Redis Streams (→ NATS JetStream at scale) |
| Workers | Node + BullMQ + Redis |
| AI | Python / FastAPI; OpenAI / Anthropic (chat) · Voyage / OpenAI (embeddings) |
| Web | Next.js 15 · React 19 · Tailwind v4 · SWR · lucide-react |
| Monorepo | pnpm workspaces + Turborepo |
| Tests | Vitest + supertest (TS, SWC for Nest DI) · pytest (Python) |
| Infra | Docker Compose (local) · Terraform (AWS target) · GitHub Actions CI |

## Repository layout

| Path | What lives here |
|------|-----------------|
| `apps/api` | NestJS modular monolith — gateway + all domain modules + dev console |
| `apps/web` | Next.js owner/manager dashboard — auth, onboarding, 11 dashboard sections |
| `apps/guest-concierge`, `apps/cleaner-pwa` | planned magic-link guest surface + cleaner PWA (spec only) |
| `services/ai-concierge` | Python FastAPI: RAG ingest/retrieval, agent, LLM/embedding providers, evals |
| `services/workers` | outbox relay, workflow engine, access scheduler, pricing sweep |
| `packages/db` | Drizzle schema, migrations, RLS/constraint SQL, seed, the `withTenant` client |
| `packages/shared` | shared TS: roles, errors, languages, the pure pricing engine |
| `packages/event-contracts` | the event catalog (zod) — source of truth for the bus |
| `packages/sdk` | typed API client: grouped namespaces, `ApiError`, 401→refresh→retry |
| `packages/ui`, `packages/config` | shared React components, tsconfig presets |
| `infra` | Compose stack (Postgres/Redis/OTel/Tempo/Grafana), Dockerfiles, Terraform |
| `simulation` | channel/guest/cleaner/lock simulators + seedable scenarios |
| `docs` | architecture, ADRs, code tour, integration guides, runbooks |

---

## Environment variables

Copy `.env.example` → `.env` and fill in. **Real secrets go in `.env` only** (it's
gitignored). Full annotated list in [`.env.example`](.env.example); the
essentials:

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
| `NEXT_PUBLIC_API_URL` | where the dashboard reaches the API — set in `apps/web/.env.local` |
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
cp .env.example .env                          # add OPENAI_API_KEY + VOYAGE_API_KEY for real AI answers
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > apps/web/.env.local

# 1. install JS deps + bootstrap the Python venv
pnpm install
pnpm run setup:ai                             # creates services/ai-concierge/.venv

# 2. bring up Postgres + Redis (add --profile observability for OTel/Grafana)
pnpm infra:up

# 3. schema + demo data
pnpm db:migrate
pnpm db:seed
```

Then run the services, each in its own terminal:

```bash
pnpm --filter @xenia/api dev        # API + console  → http://localhost:4000
pnpm --filter @xenia/web dev        # dashboard      → http://localhost:3000
pnpm run dev:ai                     # AI concierge   → http://localhost:8000
pnpm --filter @xenia/workers dev    # background workers
```

Open the dashboard and hit **Create an account** to register an org — the
onboarding wizard takes it from there. To drive the platform without any
frontend, open the dev console at `http://localhost:4000/console`.

Ports: API **4000** · web **3000** · AI **8000** · Postgres **5442** · Redis
**6399** · Grafana **3001** · Tempo **3200**. Swagger at
`http://localhost:4000/docs`.

---

## The dev console

An internal tool served by the API at **`/console`** (dev-gated). It exercises
every module without a frontend or curl:

- **Session** — one-click "Bootstrap demo organization" + login/refresh/logout;
  separate owner/cleaner/guest tokens.
- **Service health** — live API/AI reachability + which chat/embedding providers
  and keys are configured.
- **Workloads** — 10 chained scenarios (estate setup → Airbnb booking → channel
  conflict → cleaner turnover → door-code lifecycle → stock the knowledge base →
  guest asks the concierge → maintenance + vendor payout → pricing →
  subscription + cleaner payout), each with live step logs.
- **AI Concierge panel** — the live RAG answer as chat bubbles + an interactive
  "ask as the guest" box.
- **Request builder** + endpoint catalog (88 endpoints) + a status-coloured
  request log.

Hidden in production unless `ENABLE_DEV_CONSOLE=true`.

---

## Testing

**110 tests**, all against real Postgres/Redis — no mocked database:

```bash
pnpm test                                    # all TS suites (api + workers)
pnpm --filter @xenia/api test                # 81 API e2e tests
pnpm --filter @xenia/workers test            # 9 worker tests
services/ai-concierge/.venv/bin/python -m pytest services/ai-concierge/tests   # 20 AI tests
```

Coverage highlights: the booking-exclusivity/conflict path, RBAC denials and
cross-tenant isolation, refresh-token rotation and theft detection, the KB
embedding lifecycle (create/add/edit/delete → reindex), and the concierge's
graceful-degradation paths. TS uses Vitest (SWC, so Nest DI metadata is emitted);
Python uses pytest, offline and deterministic via a fake LLM provider and stub
embeddings.

---

## Deployment

- **Local / CI**: the Docker Compose stack in `infra/compose`. CI
  (`.github/workflows/ci.yml`) spins up Postgres + Redis, migrates, seeds, then
  typechecks/builds/tests the TS workspace and runs the Python suite.
- **Production target**: `infra/docker` has per-service Dockerfiles;
  `infra/terraform` sketches the AWS path (ECS Fargate, RDS Postgres,
  ElastiCache, S3, Secrets Manager). The MVP can also deploy to Fly.io/Railway.

---

## Project status

**Built and tested** — the data + security layer, auth, all 16 domain modules,
the event-driven spine (outbox → workers → workflow fan-out), the AI concierge
(RAG ingest + retrieval + provider-swappable generation with graceful
degradation), the owner dashboard, and the dev console.

**Simulated behind ports** — channel managers, Stripe billing/payouts, smart
locks, and WhatsApp/Viber messaging. The flows are real and tested end-to-end;
each needs one adapter to go live.

**Not built yet** — the guest concierge and cleaner surfaces (`apps/guest-concierge`,
`apps/cleaner-pwa`), saga compensation in the workflow engine, the scheduler's
call into the lock provider, occupancy/ADR analytics, and Terraform deployment.

See [the roadmap](docs/architecture/roadmap.md) and
[code tour](docs/architecture/code-tour.md) for detail.

---

## License

Proprietary — all rights reserved (for now).
