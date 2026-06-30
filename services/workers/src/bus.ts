import { Redis } from 'ioredis';
import type { EventName } from '@xenia/event-contracts';

/**
 * The event bus, backed by Redis Streams in the MVP (graduates to NATS JetStream
 * when we need durable multi-consumer fan-out + replay). One stream key per event
 * type keeps consumer groups simple.
 */
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6399', {
  maxRetriesPerRequest: null,
});

const STREAM_PREFIX = 'xenia:events:';

export async function publish(
  event: EventName,
  payload: Record<string, unknown>,
): Promise<string | null> {
  return redis.xadd(`${STREAM_PREFIX}${event}`, '*', 'data', JSON.stringify(payload));
}

export async function ensureGroup(event: EventName, group: string): Promise<void> {
  try {
    await redis.xgroup('CREATE', `${STREAM_PREFIX}${event}`, group, '$', 'MKSTREAM');
  } catch (err) {
    // BUSYGROUP — the group already exists; fine.
    if (!String(err).includes('BUSYGROUP')) throw err;
  }
}

export function streamKey(event: EventName): string {
  return `${STREAM_PREFIX}${event}`;
}
