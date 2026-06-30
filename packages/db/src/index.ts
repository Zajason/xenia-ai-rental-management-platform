export * from './client';
export * as schema from './schema/index';

// Re-export the drizzle query operators so every consumer shares ONE set of
// drizzle types (resolved here, in @xenia/db). Importing `eq`/`and`/… straight
// from 'drizzle-orm' in an ESM package while `db` is built CommonJS triggers the
// dual-package types hazard (two non-identical `SQL<>` types). Import these from
// '@xenia/db' instead.
export {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  isNotNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';
