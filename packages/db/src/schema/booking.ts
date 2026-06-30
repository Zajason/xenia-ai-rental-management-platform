import {
  jsonb,
  numeric,
  pgEnum,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';
import { guests } from './guest';

export const channelType = pgEnum('channel_type', [
  'airbnb',
  'booking',
  'vrbo',
  'direct',
  'ical',
]);
export const bookingStatus = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'modified',
  'cancelled',
]);

export const channels = pgTable('channels', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  type: channelType('type').notNull(),
  name: text('name').notNull(),
  ...timestamps,
});

export const channelConnections = pgTable('channel_connections', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  externalUnitId: varchar('external_unit_id', { length: 128 }),
  credentialsRef: text('credentials_ref'),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  ...timestamps,
});

export const bookings = pgTable('bookings', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').references(() => channels.id),
  guestId: uuid('guest_id').references(() => guests.id),
  status: bookingStatus('status').notNull().default('pending'),
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  externalRef: varchar('external_ref', { length: 128 }),
  sourcePayload: jsonb('source_payload'),
  ...timestamps,
});

/** One booking can be known by different ids on different channels. */
export const bookingExternalRefs = pgTable(
  'booking_external_refs',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id),
    externalId: varchar('external_id', { length: 128 }).notNull(),
    ...timestamps,
  },
  (t) => ({ uq: unique().on(t.channelId, t.externalId) }),
);

/**
 * Idempotency table for inbound webhooks. We persist the raw event keyed on the
 * provider's own event id BEFORE processing, ACK 200 immediately, then process
 * from a queue. The unique constraint makes duplicate deliveries harmless.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 48 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 191 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('received'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({ uq: unique().on(t.provider, t.externalEventId) }),
);

export const syncRuns = pgTable('sync_runs', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => channelConnections.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  result: varchar('result', { length: 24 }),
  diff: jsonb('diff'),
  ...timestamps,
});
