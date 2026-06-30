# @xenia/db

The data model and the single source of truth for Xenia's schema. Drizzle ORM +
Postgres.

## Layout

- `src/schema/` — one file per bounded context (identity, property, booking,
  calendar, messaging, tasks, access, maintenance, notifications, ai, workflow,
  pricing, billing, audit). `index.ts` is the barrel drizzle-kit reads.
- `src/client.ts` — the pooled Drizzle client + `withTenant(orgId, fn)`, the only
  sanctioned way to touch tenant data (sets the RLS GUC per transaction).
- `migrations/` — drizzle-kit generated SQL.
- `migrations/manual/` — hand-written SQL drizzle-kit can't express:
  - `0001_extensions.sql` — pgcrypto, btree_gist, pgvector.
  - `0002_exclusion_constraint.sql` — **no double-booking, enforced by Postgres.**
  - `0003_rls.sql` — Row-Level Security on every `org_id` table.
  - `0004_pgvector_index.sql` — HNSW index for KB search.
  - `0005_app_role.sql` — the non-superuser app role RLS depends on.
- `src/migrate.ts` / `src/seed.ts` — apply migrations / seed the demo tenant.

## Two-role model (why)

RLS is only enforced for roles that are **not** superusers and **not** the table
owner with BYPASSRLS. So:

| Role | Used by | RLS |
|------|---------|-----|
| `xenia` (privileged) | migrations, seed (`DATABASE_ADMIN_URL`) | bypassed |
| `xenia_app` (plain) | the running app (`DATABASE_URL`) | **enforced** |

## Commands

```bash
pnpm db:generate   # drizzle-kit: generate SQL from the schema
pnpm db:migrate    # apply generated + manual SQL (as the privileged role)
pnpm db:seed       # seed the demo tenant
pnpm db:studio     # drizzle studio
```
