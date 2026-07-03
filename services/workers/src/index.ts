import './env.js'; // must be first — selects the BYPASSRLS worker DB role
import { ensureGroup, redis, streamKey } from './bus.js';
import { startOutboxRelay } from './outbox-relay.js';
import { runWorkflowsFor } from './workflow-engine/engine.js';
import { tickAccessLifecycle } from './scheduler/access-scheduler.js';

const GROUP = 'workers';

/**
 * Worker process entrypoint. Wires three things:
 *   1. the outbox relay (DB → bus)
 *   2. the workflow engine consuming `booking.confirmed`
 *   3. the access-lifecycle scheduler tick
 *
 * Real deployment splits these into separate BullMQ workers; for the MVP one
 * process is enough and far easier to run.
 */
async function main() {
  console.log('[workers] starting…');

  startOutboxRelay(1000);

  // Consume booking.confirmed → run matching workflows.
  await ensureGroup('booking.confirmed', GROUP);
  void consumeBookingConfirmed();

  // Access lifecycle every 30s.
  setInterval(() => {
    tickAccessLifecycle()
      .then((r) => r.activated + r.expired > 0 && console.log('[access]', r))
      .catch((err) => console.error('[access]', err));
  }, 30_000);

  console.log('[workers] up.');
}

async function consumeBookingConfirmed() {
  const key = streamKey('booking.confirmed');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = (await redis.xreadgroup(
        'GROUP',
        GROUP,
        'consumer-1',
        'COUNT',
        10,
        'BLOCK',
        5000,
        'STREAMS',
        key,
        '>',
      )) as [string, [string, string[]][]][] | null;

      if (!res) continue;
      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          const dataIdx = fields.indexOf('data');
          const payload = JSON.parse(fields[dataIdx + 1] ?? '{}');
          await runWorkflowsFor('booking.confirmed', payload.orgId, payload);
          await redis.xack(key, GROUP, id);
        }
      }
    } catch (err) {
      console.error('[consume booking.confirmed]', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

void main();
