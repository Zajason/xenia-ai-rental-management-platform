# packages/

Internal libraries shared across apps and services. Nothing here is deployed on
its own; each is consumed via the pnpm workspace (`@xenia/*`).

- **db** — Drizzle schema (one file per bounded context), migrations, RLS
  policies, the range-exclusion constraint that makes double-booking impossible,
  the DB client, and the seed script. The single source of truth for the data model.
- **shared** — framework-agnostic TS: domain enums, value types, and zod schemas
  used by both the API and the workers.
- **event-contracts** — the **event catalog**. Every event that flows on the bus
  is defined here once (name + zod payload), so producers and consumers can never
  drift. This is the contract that keeps the modular monolith honestly decoupled.
- **sdk** — typed HTTP client for the API, consumed by all frontends.
- **ui** — shared React component library (shadcn/ui based) + design tokens.
- **config** — shared tsconfig / prettier / lint presets so every package is
  configured identically.
