import { doublePrecision, integer, pgEnum, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';
import { organizations } from './identity';

export const unitStatus = pgEnum('unit_status', ['ready', 'dirty', 'maintenance', 'blocked']);

export const properties = pgTable('properties', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  ...timestamps,
});

export const units = pgTable('units', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(2),
  bedrooms: integer('bedrooms').notNull().default(1),
  status: unitStatus('status').notNull().default('ready'),
  ...timestamps,
});

export const amenities = pgTable('amenities', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 48 }).notNull(),
  label: text('label').notNull(),
  ...timestamps,
});

/**
 * Typed, structured knowledge about a unit (wifi password, parking, appliance
 * how-tos). This is the *source of truth* that both the dashboard UI and the AI
 * concierge's knowledge base derive from — keep them from drifting by deriving
 * KB chunks from these rows.
 */
export const propertyFacts = pgTable('property_facts', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 48 }).notNull(),
  key: varchar('key', { length: 96 }).notNull(),
  value: text('value').notNull(),
  ...timestamps,
});

export const houseRules = pgTable('house_rules', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  ruleText: text('rule_text').notNull(),
  ordinal: integer('ordinal').notNull().default(0),
  ...timestamps,
});

export const media = pgTable('media', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  url: text('url').notNull(),
  ...timestamps,
});
