import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  text,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';
import { guests } from './guest';
import { conversations } from './messaging';
import { bookings } from './booking';

export const kbSourceType = pgEnum('kb_source_type', ['fact', 'manual', 'local_guide', 'faq']);

export const kbDocuments = pgTable('kb_documents', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceType: kbSourceType('source_type').notNull().default('manual'),
  /** Source language; retrieval is cross-lingual and answers are translated. */
  language: varchar('language', { length: 8 }).notNull().default('en'),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

/**
 * Vector-searchable chunks. RLS + the `unit_id` filter guarantee a guest at unit
 * A can never retrieve unit B's door code — correctness AND security in one.
 * Indexed with HNSW (see migrations/0003_pgvector.sql).
 */
export const kbChunks = pgTable('kb_chunks', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }),
  // Nullable: a chunk can come from a kb_document OR from a structured
  // property_fact (which has no parent document).
  documentId: uuid('document_id').references(() => kbDocuments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  /** e.g. {source:'fact',factId,category} or {source:'document',title}. */
  metadata: jsonb('metadata'),
  ...timestamps,
});

/** One AI conversation session, bound to a stay. Holds rolling per-stay memory. */
export const agentSessions = pgTable('agent_sessions', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  guestId: uuid('guest_id').references(() => guests.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  /** Rolling summary of the conversation so far (short-term memory). */
  summary: text('summary'),
  /** Per-stay learned facts: arrival time, issues raised, requests. */
  memory: jsonb('memory').$type<Record<string, unknown>>().notNull().default({}),
  language: varchar('language', { length: 8 }).notNull().default('en'),
  ...timestamps,
});

export const agentMessages = pgTable('agent_messages', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull(),
  content: text('content').notNull(),
  /** Which chunks grounded this answer — makes wrong answers debuggable. */
  retrievedChunkIds: jsonb('retrieved_chunk_ids').$type<string[]>(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  ...timestamps,
});

/** Every tool call the agent makes, with args, result, and approval trail. */
export const toolInvocations = pgTable('tool_invocations', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 96 }).notNull(),
  args: jsonb('args'),
  result: jsonb('result'),
  /** For write tools that require human approval before execution. */
  approvedBy: uuid('approved_by'),
  status: varchar('status', { length: 24 }).notNull().default('executed'),
  ...timestamps,
});

export const evalRuns = pgTable('eval_runs', {
  id: id(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  dataset: varchar('dataset', { length: 96 }).notNull(),
  model: varchar('model', { length: 64 }).notNull(),
  scores: jsonb('scores').notNull(),
  ...timestamps,
});
