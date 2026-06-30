# Event catalog

The source of truth is code: `packages/event-contracts/src/index.ts` (zod
payloads). This page is the human-readable index. Events are facts, named
`<aggregate>.<past-tense>`.

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `booking.confirmed` | booking | workflow engine, calendar, concierge, pricing |
| `booking.modified` | booking | calendar, tasks, access |
| `booking.cancelled` | booking | calendar, tasks, access, notification |
| `booking.conflict_detected` | booking/calendar | dashboard, audit |
| `availability.blocked` | calendar | analytics |
| `task.created` / `task.completed` | tasks | notification, dashboard |
| `unit.ready` | tasks | access, dashboard |
| `access.granted` / `access.expired` / `access.revoked` | access | audit, notification |
| `message.received` | messaging | concierge |
| `human.handoff.requested` | concierge | messaging, notification |
| `maintenance.ticket.opened` | maintenance | notification, vendor coordination |
| `pricing.suggestion.created` | pricing (workers) | dashboard, notification |
| `agent.action.requested` | concierge | the relevant domain module (gated) |

Add an event: add a key to `EVENTS` in event-contracts, document it here, and add
a contract test.
