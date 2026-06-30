# sync

Channel synchronization jobs: pull iCal feeds, reconcile remote calendars with
local availability, push availability back out, and process queued
`webhook_events` from channels. Implements the `ChannelProvider` interface so the
mock channel manager in `simulation/channels` and a real Airbnb/Booking
integration are interchangeable. Eventual consistency lives here — conflicts are
detected and surfaced, never silently dropped.
