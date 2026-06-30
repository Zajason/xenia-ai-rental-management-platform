# simulation/

The simulation harness — how Xenia is demoed, load-tested, and developed without
waiting on real Airbnb / Booking.com / lock-vendor API access. Deterministic and
seedable so demos are repeatable.

- **channels/** — a mock channel manager implementing the same `ChannelProvider`
  interface as a real integration. Emits realistic (and deliberately duplicated /
  out-of-order) booking webhooks to prove idempotency.
- **guests/** — scripted guest personas (the late arriver, "wifi is down", the
  early-check-in asker, the emergency) that drive the messaging pipeline and the
  concierge.
- **cleaners/** — simulated cleaner behaviour (accept, complete, no-show).
- **locks/** — the simulated smart-lock provider with controllable failures
  (offline, low battery, denied) to exercise the access lifecycle + reconciler.
- **scenarios/** — named, seeded scenarios (e.g. `busy-weekend`) that compose the
  above into a single repeatable run for the demo.

These simulators implement the same interfaces the real adapters do, so swapping
in a real provider later is a config change, not a rewrite.
