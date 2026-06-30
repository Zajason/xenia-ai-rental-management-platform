import { jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id } from './_shared';
import { organizations } from './identity';

/**
 * Append-only record of every state change and access event. Critical for a
 * system that unlocks doors. Partitioned by month in production (see
 * migrations/0004_audit_partitioning.sql). The `correlationId` lets you tie an
 * audit row back to the distributed trace that produced it.
 */
export const auditEvents = pgTable('audit_events', {
  id: id(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  actorType: varchar('actor_type', { length: 24 }).notNull(),
  actorId: uuid('actor_id'),
  action: varchar('action', { length: 96 }).notNull(),
  resourceType: varchar('resource_type', { length: 48 }).notNull(),
  resourceId: uuid('resource_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  correlationId: varchar('correlation_id', { length: 64 }),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
