import { and, eq, db, schema } from '@xenia/db';
import { publish } from './bus.js';
import type { EventName } from '@xenia/event-contracts';

/**
 * The transactional-outbox relay. Domain writes insert an `outbox` row in the
 * same transaction as the business change; this loop drains pending rows onto the
 * bus and marks them published. At-least-once delivery + idempotent consumers =
 * reliable events with no distributed transaction.
 *
 * (Polling for the MVP; switch to LISTEN/NOTIFY or logical decoding for lower
 * latency later.)
 */
export async function relayOnce(): Promise<number> {
  const pending = await db
    .select()
    .from(schema.outbox)
    .where(eq(schema.outbox.status, 'pending'))
    .limit(100);

  for (const row of pending) {
    await publish(row.eventType as EventName, {
      eventId: row.id,
      orgId: row.orgId,
      occurredAt: row.createdAt.toISOString(),
      ...(row.payload as Record<string, unknown>),
    });
    await db
      .update(schema.outbox)
      .set({ status: 'published', publishedAt: new Date() })
      .where(and(eq(schema.outbox.id, row.id)));
  }
  return pending.length;
}

export function startOutboxRelay(intervalMs = 1000): NodeJS.Timeout {
  return setInterval(() => {
    relayOnce().catch((err) => console.error('[outbox-relay]', err));
  }, intervalMs);
}
