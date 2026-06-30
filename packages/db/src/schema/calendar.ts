import { numeric, integer, pgEnum, text, timestamp, uuid, date } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';

export const blockSource = pgEnum('block_source', [
  'booking',
  'hold',
  'manual',
  'maintenance',
]);

/**
 * The single source of truth for what is bookable when.
 *
 * The no-overlap invariant is NOT enforced in application code — it is enforced
 * by Postgres itself via an exclusion constraint:
 *
 *   EXCLUDE USING gist (unit_id WITH =, tstzrange(check_in, check_out) WITH &&)
 *
 * added in migrations/0002_exclusion_constraint.sql. Two concurrent channels
 * cannot double-book a unit even under a race — the second INSERT fails. This is
 * the cardinal correctness property of the whole platform.
 */
export const availabilityBlocks = pgTable('availability_blocks', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  source: blockSource('source').notNull(),
  sourceId: uuid('source_id'),
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  ...timestamps,
});

export const holds = pgTable('holds', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  reason: text('reason'),
  ...timestamps,
});

export const rateCalendar = pgTable('rate_calendar', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }),
  minNights: integer('min_nights').notNull().default(1),
  ...timestamps,
});
