import { integer, numeric, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations, users } from './identity';

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

export const payoutStatus = pgEnum('payout_status', ['pending', 'processing', 'paid', 'failed']);
export const payeeType = pgEnum('payee_type', ['staff', 'vendor']);

/**
 * In-app payouts: the owner/manager paying a cleaner or a repair vendor through
 * Xenia. Backed by a PaymentProvider (simulated now, Stripe Connect transfers in
 * production — see docs/integrations/billing.md). `payeeId` points at staff.id or
 * vendors.id depending on payeeType (polymorphic, validated in the service).
 * taskId/ticketId optionally link the payout to the work it pays for.
 */
export const payouts = pgTable('payouts', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  payerUserId: uuid('payer_user_id').references(() => users.id),
  payeeType: payeeType('payee_type').notNull(),
  payeeId: uuid('payee_id').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  status: payoutStatus('status').notNull().default('pending'),
  provider: varchar('provider', { length: 24 }).notNull().default('simulated'),
  providerRef: varchar('provider_ref', { length: 191 }),
  taskId: uuid('task_id'),
  ticketId: uuid('ticket_id'),
  note: text('note'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
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
