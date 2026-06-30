# Implementation roadmap

- **Phase 0 — Architecture & design.** Repo scaffold, ADRs, event catalog, DB
  schema, Compose stack, CI skeleton, auth + multi-tenant RLS. *(this skeleton)*
- **Phase 1 — Core data model & dashboard.** Identity, property/unit, RBAC, owner
  dashboard reading live data, seed.
- **Phase 2 — Booking / calendar / task flows.** iCal + mock channel ingest,
  webhook idempotency, availability + exclusion constraint, outbox + bus, workflow
  engine, cleaning tasks, cleaner PWA, notifications.
- **Phase 3 — AI concierge.** KB ingestion + pgvector RAG, agent with read tools,
  escalation, guest concierge surface, returning-guest memory, multi-language,
  eval harness v1.
- **Phase 4 — Smart lock lifecycle.** Simulated provider, credential
  scheduling/expiry/revocation, access audit, reconciliation, one Seam integration.
- **Phase 5 — Analytics / automation / observability.** Occupancy/ADR dashboards,
  rules-based pricing suggestions, workflow-run visualization, full tracing,
  write-tool approvals, maintenance → vendor flow.
- **Phase 6 — Polish, docs, deploy, demo.** Terraform AWS deploy, k6 load tests,
  OpenAPI/AsyncAPI docs, README + diagram + demo GIF, seeded `busy-weekend` demo.
