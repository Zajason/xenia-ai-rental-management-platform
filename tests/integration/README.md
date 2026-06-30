# tests/integration

Multi-module flows against a real Postgres + Redis (the Compose stack). The
canonical case: confirm a booking → assert an availability block, a cleaning task,
an access credential, and a `booking.confirmed` outbox row all exist. Also covers
the double-booking rejection (expect a 409 / exclusion violation).
