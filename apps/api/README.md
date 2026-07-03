# @xenia/api

The NestJS **modular monolith** — the API gateway and the home of every domain
module. One process, hard module boundaries (see `src/modules/`).

- `src/main.ts` — bootstrap; starts OpenTelemetry first, then Nest + Swagger (`/docs`).
- `src/app.module.ts` — wires modules + the tenant middleware.
- `src/common/` — tenant resolution, `@CurrentOrg()`, RBAC.
- `src/observability/` — OTel tracing setup.
- `src/modules/<context>/` — one bounded context each (README in every folder).

```bash
pnpm --filter @xenia/api dev      # nest start --watch on :4000
```

**Dev console:** with the API running, open http://localhost:4000/console — an
internal tool that exercises every module: one-click org bootstrap, chained
workload scenarios (bookings, channel conflicts, turnovers, door codes,
concierge, payouts…), an endpoint catalog with a request builder
(`{{unitId}}`-style context variables), and a full request log. It authenticates
like any real client (owner/cleaner/guest tokens) and is hidden in production
unless `ENABLE_DEV_CONSOLE=true`. Swagger stays at `/docs`.

Touch tenant data only through `withTenant(orgId, …)` from `@xenia/db` so RLS
applies. Cross-module calls go through injected services or the event bus.
