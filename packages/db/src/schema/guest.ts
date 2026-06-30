import { boolean, integer, jsonb, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';

export const guests = pgTable('guests', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name'),
  email: varchar('email', { length: 320 }),
  phone: varchar('phone', { length: 32 }),
  /** Drives the multi-language concierge: replies are generated in this language. */
  preferredLanguage: varchar('preferred_language', { length: 8 }).notNull().default('en'),
  notes: text('notes'),
  ...timestamps,
});

/**
 * FEATURE: returning-guest memory (cross-stay).
 *
 * A durable profile that persists across bookings: learned preferences, dietary
 * notes, recurring requests, VIP flags. Distinct from per-stay agent memory
 * (which lives with the AI session). Matched to a guest by email/phone on a new
 * booking so a returning guest is recognised and greeted with context.
 */
export const guestProfiles = pgTable('guest_profiles', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  guestId: uuid('guest_id')
    .notNull()
    .references(() => guests.id, { onDelete: 'cascade' }),
  /** Free-form, AI-maintained summary of who this guest is across stays. */
  summary: text('summary'),
  /** Structured, queryable preferences: { earlyCheckIn: true, allergies: [...] }. */
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({}),
  stayCount: integer('stay_count').notNull().default(0),
  isVip: boolean('is_vip').notNull().default(false),
  ...timestamps,
});
