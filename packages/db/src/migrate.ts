/**
 * Applies migrations in two passes, connecting as the PRIVILEGED role
 * (DATABASE_ADMIN_URL) so it can create extensions, roles, and constraints:
 *   1. drizzle-kit generated SQL in ./migrations (the table DDL)
 *   2. hand-written SQL in ./migrations/manual (extensions, the range exclusion
 *      constraint, RLS policies, pgvector index, the non-superuser app role)
 *
 * Run with: pnpm db:migrate
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import pg from 'pg';

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgres://xenia:xenia@localhost:5442/xenia';

// __dirname is a CommonJS global (this package is type: commonjs).
const migrationsDir = join(__dirname, '..', 'migrations');
const manualDir = join(migrationsDir, 'manual');

async function run() {
  const pool = new pg.Pool({ connectionString: adminUrl });
  const db = drizzle(pool);

  console.log('→ applying drizzle migrations…');
  try {
    await migrate(db, { migrationsFolder: migrationsDir });
  } catch (err) {
    console.warn('  (no generated migrations yet — run `pnpm db:generate` first)');
  }

  console.log('→ applying manual SQL (extensions, RLS, constraints, app role)…');
  const files = (await readdir(manualDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const text = await readFile(join(manualDir, file), 'utf8');
    console.log(`  • ${file}`);
    await db.execute(sql.raw(text));
  }

  console.log('✓ migrations complete');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
