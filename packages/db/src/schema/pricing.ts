import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';

export const suggestionStatus = pgEnum('suggestion_status', [
  'suggested',
  'accepted',
  'rejected',
  'expired',
]);

/** Daily rollups feeding the analytics dashboard (occupancy, ADR, RevPAR). */
export const metricsDaily = pgTable('metrics_daily', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  occupied: boolean('occupied').notNull().default(false),
  revenue: numeric('revenue', { precision: 12, scale: 2 }).notNull().default('0'),
  adr: numeric('adr', { precision: 12, scale: 2 }),
  ...timestamps,
});

/**
 * FEATURE: rules-based pricing suggestions (v1, before any ML).
 *
 * A rule is a declarative condition → adjustment, e.g.
 *   { when: { leadTimeDays: { lt: 3 }, occupancy: { lt: 0.5 } },
 *     then: { adjustPct: -15 }, priority: 10 }
 * The pricing engine (services/workers) evaluates enabled rules over the rate
 * calendar and emits `pricing.suggestion.created` events. ML pricing slots in
 * later behind the same suggestion output.
 */
export const pricingRules = pgTable('pricing_rules', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Declarative match: lead time, day-of-week, occupancy, gap nights, events. */
  conditions: jsonb('conditions').notNull(),
  /** Declarative effect: { adjustPct } or { adjustAbs } or { setMinNights }. */
  effect: jsonb('effect').notNull(),
  priority: integer('priority').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
});

export const pricingSuggestions = pgTable('pricing_suggestions', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  currentPrice: numeric('current_price', { precision: 12, scale: 2 }),
  suggestedPrice: numeric('suggested_price', { precision: 12, scale: 2 }).notNull(),
  /** Which rules fired + human-readable reason — pricing is explainable. */
  rationale: jsonb('rationale').$type<{ ruleId: string; reason: string }[]>(),
  status: suggestionStatus('status').notNull().default('suggested'),
  ...timestamps,
});
