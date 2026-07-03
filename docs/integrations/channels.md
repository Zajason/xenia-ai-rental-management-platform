# Channel integrations — dummy today, real tomorrow

## What runs today (no external accounts needed)

The channel manager is fully operational against **dummy providers**. A "channel"
is created via `POST /channels` (returns a per-channel `webhookSecret` once), and
any provider — dummy or real — posts booking events to:

```
POST /webhooks/channels/:orgId/:channelId
x-channel-secret: <the secret>
{
  "eventId":    "unique-per-event",          // idempotency key
  "type":       "booking.created" | "booking.cancelled",
  "externalRef":"HMABCDEF",                  // the provider's reservation id
  "unitId":     "<xenia unit uuid>",
  "checkIn":    "2026-07-10T12:00:00Z",
  "checkOut":   "2026-07-15T12:00:00Z",
  "guest":      { "name", "email", "language?" }
}
```

Guarantees enforced (and covered by `apps/api/test/channels.e2e.spec.ts`):
- **Idempotency** — duplicate `eventId` deliveries are no-ops (`webhook_events` unique constraint).
- **Booking exclusivity** — an overlapping reservation from *any* channel is rejected
  by the Postgres exclusion constraint, recorded as a `conflict` webhook status,
  emitted as `booking.conflict_detected`, and written to the audit trail. The
  provider still gets HTTP 200 (so it doesn't retry forever); the conflict is an
  *operator-facing* signal, not a provider-facing error.
- **Cancellation** frees the availability block so other channels can rebook.

## What real operation requires

### Airbnb
- **No public API.** Access is via the [Airbnb Partner/Preferred Software Partner
  program](https://www.airbnb.com/partner) — an application + review process
  aimed at established property-management software. Expect months, and volume
  requirements.
- Once accepted: OAuth2 per host account; Listings/Reservations/Messaging APIs;
  reservation webhooks. Map their reservation payload → our webhook envelope in
  a small adapter (`ChannelProvider` implementation).
- **Realistic near-term path: iCal.** Every Airbnb listing exposes an iCal feed
  (availability only, coarse, pull-based). The `sync` worker polls the feed and
  diffs against `availability_blocks`. No approval needed. Losses vs API: no
  guest details, no messaging, ~hours of latency.

### Booking.com
- The **Connectivity Partner program** ([connect.booking.com](https://connect.booking.com)):
  application, certification tests, and a signed agreement. You implement their
  OTA-style XML/JSON APIs (availability/rates push, reservations pull or push).
- Alternative while waiting: many hosts run a commercial channel manager
  (Rentals United, Hostaway, etc.) that resells connectivity via ordinary REST
  APIs — integrating one of those gets you Airbnb+Booking+Vrbo in one adapter at
  a per-property fee.

### Vrbo / Expedia
- **Expedia Group EPC/Rapid partner APIs** — same pattern: partner application,
  then push/pull endpoints. Also covered by the commercial channel managers.

### Config expected when a real adapter lands
```
# per real channel connection
CHANNEL_<X>_CLIENT_ID / _CLIENT_SECRET   # OAuth for the provider
# plus each connection row stores the provider's listing id ↔ unit mapping
# (channel_connections.external_unit_id) and credentials ref (vault).
```

### The adapter contract
A real integration implements the same `ChannelProvider` surface the dummies use:
translate provider payloads → our webhook envelope, push availability updates
back out, and reconcile on a schedule (`sync_runs`). Nothing downstream changes —
the exclusivity/idempotency machinery is already provider-agnostic.
