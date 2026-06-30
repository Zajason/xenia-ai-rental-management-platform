# booking  *(implemented)*

Normalizes bookings from Airbnb/Booking.com/Vrbo/direct/iCal into one model;
idempotent webhook ingestion; emits the events that drive everything downstream.
`booking.service.ts` demonstrates the cardinal pattern: booking + availability
block + outbox event written in one transaction, with the exclusion-constraint
conflict translated to a 409.

- **Tables:** channels, channel_connections, bookings, booking_external_refs,
  webhook_events (idempotency), sync_runs.
- **Events:** `booking.confirmed`, `booking.modified`, `booking.cancelled`,
  `booking.conflict_detected`.
- **Failure modes:** double-booking (DB-prevented), duplicate webhooks (idempotency
  table), channel rate limits, timezone skew.
