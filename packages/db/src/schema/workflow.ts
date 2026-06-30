import { boolean, integer, jsonb, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';

export const runStatus = pgEnum('run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'compensating',
  'compensated',
]);

/**
 * Declarative automations: "on event X, if conditions, do actions Y" with
 * retries, delays, and compensation. The workflow engine (services/workers)
 * consumes domain events and executes these.
 */
export const workflows = pgTable('workflows', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  triggerEvent: varchar('trigger_event', { length: 96 }).notNull(),
  definition: jsonb('definition').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const workflowRuns = pgTable('workflow_runs', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, { onDelete: 'cascade' }),
  triggerPayload: jsonb('trigger_payload'),
  status: runStatus('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  ...timestamps,
});

export const runSteps = pgTable('run_steps', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  runId: uuid('run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepKey: varchar('step_key', { length: 96 }).notNull(),
  status: runStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  output: jsonb('output'),
  /** What to run to undo this step if a later step fails (saga compensation). */
  compensation: jsonb('compensation'),
  ...timestamps,
});

/**
 * Transactional outbox. Domain writes insert here in the SAME transaction as the
 * business row; the relay worker publishes rows to the event bus and marks them
 * published. At-least-once delivery + idempotent consumers = reliable events
 * without distributed transactions.
 */
export const outbox = pgTable('outbox', {
  id: id(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  aggregate: varchar('aggregate', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 96 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  ...timestamps,
});
