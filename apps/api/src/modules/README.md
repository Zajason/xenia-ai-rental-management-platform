# apps/api/src/modules — bounded contexts

One folder per bounded context from the architecture. Each is a NestJS module.
They communicate via injected services and the event bus, never by reading
another context's tables. **All modules are implemented** and covered by the e2e
suites in `apps/api/test/` (identity/auth lives in `src/auth`). External
integrations (channels, billing) run on dummy providers behind ports — see
`docs/integrations/` for what real operation requires.

| Module | Responsibility |
|--------|----------------|
| identity | users, orgs, memberships, RBAC, sessions, magic links |
| property | properties, units, amenities, typed facts, house rules |
| booking | channel ingestion, normalization, idempotent webhooks |
| calendar | availability, holds, conflict detection |
| messaging | omnichannel guest conversations |
| concierge | gateway to the Python AI service (RAG + agent) |
| access | smart-lock credential lifecycle |
| tasks | cleaning/turnover scheduling + cleaner workflow |
| maintenance | tickets + vendor coordination |
| notification | email/SMS/WhatsApp/push fan-out |
| pricing | rules-based pricing suggestions + analytics |
| workflow | thin API over the workers' workflow engine |
| audit | immutable event log queries |
| billing | subscriptions, usage, Stripe |
