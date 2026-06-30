import { boolean, jsonb, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';

export const notifChannel = pgEnum('notif_channel', ['email', 'sms', 'whatsapp', 'push']);

export const notificationPreferences = pgTable('notification_preferences', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  subjectType: varchar('subject_type', { length: 24 }).notNull(),
  subjectId: uuid('subject_id').notNull(),
  channel: notifChannel('channel').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  quietHours: jsonb('quiet_hours'),
  ...timestamps,
});

export const notifications = pgTable('notifications', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  recipientRef: varchar('recipient_ref', { length: 191 }).notNull(),
  template: varchar('template', { length: 96 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  /** Idempotency: (recipient, template, dedupeKey) is sent at most once. */
  dedupeKey: varchar('dedupe_key', { length: 191 }),
  status: varchar('status', { length: 24 }).notNull().default('queued'),
  ...timestamps,
});

export const deliveryLog = pgTable('delivery_log', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  channel: notifChannel('channel').notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  providerRef: varchar('provider_ref', { length: 191 }),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
