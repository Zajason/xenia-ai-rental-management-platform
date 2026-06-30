import { integer, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';
import { bookings } from './booking';

export const credentialType = pgEnum('credential_type', ['code', 'nfc', 'mobile_key']);
export const credentialStatus = pgEnum('credential_status', [
  'pending',
  'active',
  'expired',
  'revoked',
  'failed',
]);

export const locks = pgTable('locks', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  /** simulator | seam | ... — selects the LockProvider adapter at runtime. */
  provider: varchar('provider', { length: 32 }).notNull().default('simulator'),
  externalLockId: varchar('external_lock_id', { length: 128 }),
  status: varchar('status', { length: 24 }).notNull().default('online'),
  battery: integer('battery'),
  ...timestamps,
});

/**
 * A time-boxed credential. The lifecycle is the interesting part:
 *   pending → (scheduler activates at valid_from) → active
 *           → (scheduler revokes at valid_to)      → expired
 * A reconciliation job compares this table to the real lock state and repairs
 * drift. Every transition emits an access_event and an audit_event.
 */
export const accessCredentials = pgTable('access_credentials', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  lockId: uuid('lock_id').references(() => locks.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  type: credentialType('type').notNull().default('code'),
  /** Reference to the secret in a vault — never store the raw code in plaintext. */
  secretRef: text('secret_ref'),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }).notNull(),
  status: credentialStatus('status').notNull().default('pending'),
  ...timestamps,
});

export const accessEvents = pgTable('access_events', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  credentialId: uuid('credential_id').references(() => accessCredentials.id, {
    onDelete: 'cascade',
  }),
  lockId: uuid('lock_id').references(() => locks.id),
  event: varchar('event', { length: 24 }).notNull(),
  actor: varchar('actor', { length: 64 }),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
