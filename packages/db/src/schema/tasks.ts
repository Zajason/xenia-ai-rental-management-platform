import {
  integer,
  jsonb,
  pgEnum,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations, users } from './identity';
import { units } from './property';
import { bookings } from './booking';

export const taskType = pgEnum('task_type', ['cleaning', 'inspection', 'restock', 'custom']);
export const taskStatus = pgEnum('task_status', [
  'pending',
  'assigned',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
]);

export const staff = pgTable('staff', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 32 }),
  role: varchar('role', { length: 32 }).notNull().default('cleaner'),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const staffAvailability = pgTable('staff_availability', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
});

export const tasks = pgTable('tasks', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id),
  type: taskType('type').notNull().default('cleaning'),
  status: taskStatus('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  dueAt: timestamp('due_at', { withTimezone: true }),
  ...timestamps,
});

export const taskAssignments = pgTable('task_assignments', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  state: varchar('state', { length: 24 }).notNull().default('offered'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
});

export const checklists = pgTable('checklists', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => units.id),
  taskType: taskType('task_type').notNull().default('cleaning'),
  items: jsonb('items').$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const taskPhotos = pgTable('task_photos', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  kind: varchar('kind', { length: 16 }).notNull().default('after'),
  ...timestamps,
});
