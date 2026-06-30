# MVP scope

## Must-have (the spine)
- Auth, orgs, RBAC, multi-tenant with RLS.
- Property/unit CRUD + structured facts.
- Booking ingestion via iCal + the mock channel manager.
- Calendar availability with DB-enforced conflict prevention + surfacing.
- Workflow engine: `booking.confirmed → cleaning task + access credential + pre-arrival`.
- Task/cleaner flow + cleaner PWA (accept, checklist, photos, complete).
- Access lifecycle on the simulated lock provider (issue → activate → revoke → audit).
- AI concierge: RAG, top intents, tool calls, human escalation.
- Notifications (email + one of SMS/WhatsApp).
- Owner dashboard. Audit log + OTel tracing.

## Should-have
- Guest concierge web (magic link) + WhatsApp.
- Maintenance → vendor flow.
- Occupancy/ADR analytics.
- AI eval harness + CI regression.
- Real Seam integration for one lock vendor.
- Workflow-run visualization.

## Nice-to-have  *(three explicitly committed for Xenia)*
- **Rules-based pricing suggestions** — declarative `pricing_rules`, explainable
  `pricing_suggestions`, `pricing.suggestion.created` events.
- **Returning-guest memory** — durable `guest_profiles`, matched on email/phone,
  surfaced to the concierge.
- **Multi-language concierge** — detect language, reply in kind, cross-lingual RAG.
- Real-time dashboard via WebSocket. Billing/Stripe.

## Future advanced
- Official Airbnb/Booking/Vrbo channel APIs.
- ML dynamic pricing with comp sets.
- Cleaner route/assignment optimization.
- Hotel/PMS features (room types, housekeeping boards, POS).
- Vendor/cleaner marketplace.
