# apps/api/src/modules — bounded contexts

One folder per bounded context from the architecture. Each is (or becomes) a
NestJS module. They communicate via injected services and the event bus, never by
reading another context's tables. `health` and `booking` ship with working code;
the rest carry a README defining responsibility, entities, events, and failure
modes, and are implemented per `docs/architecture/roadmap.md`.

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
