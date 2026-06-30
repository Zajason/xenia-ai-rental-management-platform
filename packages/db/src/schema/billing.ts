import { integer, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  stripeId: varchar('stripe_id', { length: 96 }),
  plan: varchar('plan', { length: 32 }).notNull().default('trial'),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  unitCount: integer('unit_count').notNull().default(0),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  ...timestamps,
});

export const usageRecords = pgTable('usage_records', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  metric: varchar('metric', { length: 48 }).notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull().default('0'),
  period: varchar('period', { length: 16 }).notNull(),
  ...timestamps,
});
