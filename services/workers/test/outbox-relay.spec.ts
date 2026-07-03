import { createFixture } from './setup.js';
import { afterAll, describe, expect, it } from 'vitest';
import { db, eq, pool, schema } from '@xenia/db';
import { relayOnce } from '../src/outbox-relay.js';
import { redis, streamKey } from '../src/bus.js';

/** The transactional-outbox relay: DB rows → Redis Streams, exactly once. */
describe('outbox relay', () => {
  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  it('publishes pending rows to the bus and marks them published', async () => {
    const { orgId, unitId } = await createFixture();
    const [row] = await db
      .insert(schema.outbox)
      .values({
        orgId,
        aggregate: 'unit',
        eventType: 'unit.ready',
        payload: { unitId },
      })
      .returning();

    await relayOnce();

    const [after] = await db.select().from(schema.outbox).where(eq(schema.outbox.id, row!.id));
    expect(after!.status).toBe('published');
    expect(after!.publishedAt).toBeTruthy();

    // The message really is on the stream, carrying our payload + envelope.
    const entries = (await redis.xrange(streamKey('unit.ready'), '-', '+')) as [string, string[]][];
    const bodies = entries.map(([, fields]) => JSON.parse(fields[fields.indexOf('data') + 1]!));
    const ours = bodies.find((b) => b.unitId === unitId);
    expect(ours).toBeTruthy();
    expect(ours.eventId).toBe(row!.id);
    expect(ours.orgId).toBe(orgId);

    // Second relay run does not re-publish (no pending rows left for us).
    await relayOnce();
    const again = (await redis.xrange(streamKey('unit.ready'), '-', '+')) as [string, string[]][];
    const oursAgain = again
      .map(([, fields]) => JSON.parse(fields[fields.indexOf('data') + 1]!))
      .filter((b) => b.unitId === unitId);
    expect(oursAgain).toHaveLength(1);
  });
});
