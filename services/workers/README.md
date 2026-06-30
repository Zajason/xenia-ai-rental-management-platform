# @xenia/workers

The async backbone. A Node process (TypeScript) that consumes the event bus and
runs background work:

- `bus.ts` — the Redis Streams event bus (publish + consumer groups).
- `outbox-relay.ts` — drains the transactional `outbox` table onto the bus.
- `workflow-engine/` — the event-driven **workflow engine** (the conductor).
- `scheduler/` — time-boxed access codes, pre-arrival sequences, pricing sweeps.
- `pricing/` — the rules-based pricing-suggestion engine (pure + unit-tested).
- `sync/` — channel sync jobs (iCal pull, calendar reconcile, webhook processing).

```bash
pnpm --filter @xenia/workers dev
```

Split into separate BullMQ workers when scaling; one process is enough for the MVP.
