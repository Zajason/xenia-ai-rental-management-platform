# simulation/channels

Mock channel manager. Implements the same `ChannelProvider` interface a real
Airbnb/Booking.com integration would, and emits realistic booking webhooks —
including deliberate duplicates and out-of-order deliveries — so the booking
service's idempotency and conflict handling are actually exercised.
