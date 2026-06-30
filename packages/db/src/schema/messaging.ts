import { jsonb, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';
import { units } from './property';
import { bookings } from './booking';
import { guests } from './guest';

export const msgDirection = pgEnum('msg_direction', ['inbound', 'outbound']);
export const msgChannel = pgEnum('msg_channel', ['whatsapp', 'sms', 'email', 'in_app']);
export const senderType = pgEnum('sender_type', ['guest', 'host', 'ai', 'system']);

export const conversations = pgTable('conversations', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  guestId: uuid('guest_id').references(() => guests.id),
  channel: msgChannel('channel').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  /** Set when a human takes over from the AI. */
  assignedTo: uuid('assigned_to'),
  ...timestamps,
});

export const messages = pgTable('messages', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  direction: msgDirection('direction').notNull(),
  senderType: senderType('sender_type').notNull(),
  body: text('body').notNull(),
  /** Provider's id for dedupe of inbound + delivery correlation. */
  providerMessageId: varchar('provider_message_id', { length: 191 }),
  status: varchar('status', { length: 24 }).notNull().default('sent'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata'),
  ...timestamps,
});

export const deliveryReceipts = pgTable('delivery_receipts', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 24 }).notNull(),
  providerStatus: varchar('provider_status', { length: 48 }),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const messageTemplates = pgTable('message_templates', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 96 }).notNull(),
  language: varchar('language', { length: 8 }).notNull().default('en'),
  body: text('body').notNull(),
  ...timestamps,
});
