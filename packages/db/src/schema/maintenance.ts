import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';
import { accessCredentials } from './access';

export const ticketStatus = pgEnum('ticket_status', [
  'open',
  'triaged',
  'assigned',
  'in_progress',
  'resolved',
  'cancelled',
]);

export const vendors = pgTable('vendors', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  trade: varchar('trade', { length: 48 }),
  phone: varchar('phone', { length: 32 }),
  email: varchar('email', { length: 320 }),
  rating: integer('rating'),
  ...timestamps,
});

export const maintenanceTickets = pgTable('maintenance_tickets', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  reportedByType: varchar('reported_by_type', { length: 24 }).notNull().default('guest'),
  title: text('title').notNull(),
  description: text('description'),
  status: ticketStatus('status').notNull().default('open'),
  priority: integer('priority').notNull().default(0),
  cost: numeric('cost', { precision: 12, scale: 2 }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  ...timestamps,
});

export const vendorAssignments = pgTable('vendor_assignments', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => maintenanceTickets.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  state: varchar('state', { length: 24 }).notNull().default('offered'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  /** A vendor may be granted temporary access to do the work. */
  accessCredentialId: uuid('access_credential_id').references(() => accessCredentials.id),
  ...timestamps,
});

export const ticketEvents = pgTable('ticket_events', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => maintenanceTickets.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 48 }).notNull(),
  payload: jsonb('payload'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
