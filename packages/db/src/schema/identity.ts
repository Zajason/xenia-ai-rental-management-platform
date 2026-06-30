import { boolean, jsonb, pgEnum, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './_shared';

export const memberRole = pgEnum('member_role', ['owner', 'manager', 'admin', 'cleaner']);
export const subjectType = pgEnum('subject_type', ['guest', 'vendor', 'cleaner', 'staff']);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  plan: varchar('plan', { length: 32 }).notNull().default('trial'),
  ...timestamps,
});

export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: text('name'),
  hashedPassword: text('hashed_password'),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  ...timestamps,
});

export const memberships = pgTable('memberships', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull(),
  ...timestamps,
});

export const apiKeys = pgTable('api_keys', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

/**
 * Passwordless access for people who never "sign up": guests, vendors, cleaners.
 * The token is hashed; `subjectType`/`subjectId` bind it to a domain entity.
 */
export const magicLinks = pgTable('magic_links', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  subjectType: subjectType('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ...timestamps,
});

export const invitations = pgTable('invitations', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 320 }).notNull(),
  role: memberRole('role').notNull(),
  /** sha256 of the invite token; the raw token is only ever sent to the invitee. */
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

/**
 * Rotating refresh tokens. We store only the sha256 hash; the raw token lives
 * client-side. On refresh we rotate (revoke the old, issue a new, link via
 * `replacedById`) so a stolen-and-reused token is detectable. Auth is pre-tenant
 * so this table has no org_id (no RLS) — `orgId` here just records which org the
 * session is scoped to.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedById: uuid('replaced_by_id'),
  userAgent: text('user_agent'),
  ...timestamps,
});
