import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema/index';

// The running app connects as the NON-superuser app role so RLS is enforced.
const connectionString =
  process.env.DATABASE_URL ?? 'postgres://xenia_app:xenia_app@localhost:5442/xenia';

/** Shared connection pool. */
export const pool = new pg.Pool({ connectionString });

/** The Drizzle client. Import `db` everywhere you need typed DB access. */
export const db = drizzle(pool, { schema });

export type Database = typeof db;

/**
 * Run a unit of work inside a transaction with the tenant context set, so
 * Row-Level Security scopes every query to `orgId`. This is the ONLY way the
 * rest of the app should touch tenant data — it makes a forgotten WHERE clause
 * unable to leak across tenants.
 */
export async function withTenant<T>(
  orgId: string,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}

export { schema };
export * from './schema/index';
