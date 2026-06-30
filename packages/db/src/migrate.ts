/**
 * Applies migrations, connecting as the PRIVILEGED role (DATABASE_ADMIN_URL) so
 * it can create extensions, roles, and constraints:
 *   0. ensure required extensions exist (the generated DDL declares a pgvector
 *      column, so `vector` must be installed before pass 1)
 *   1. drizzle-kit generated SQL in ./migrations (the table DDL)
 *   2. hand-written SQL in ./migrations/manual (the range exclusion constraint,
 *      RLS policies, pgvector index, the non-superuser app role, auth functions)
 *
 * Run with: pnpm db:migrate
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
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

  // 0. Extensions FIRST — the generated migration creates a `vector(1024)`
  //    column, which requires the pgvector extension to already exist. Locally
  //    the Docker init script provides these; CI's bare Postgres does not, so we
  //    create them here to make `db:migrate` self-sufficient everywhere.
  console.log('→ ensuring required extensions…');
  await db.execute(
    sql.raw(
      'CREATE EXTENSION IF NOT EXISTS pgcrypto; ' +
        'CREATE EXTENSION IF NOT EXISTS btree_gist; ' +
        'CREATE EXTENSION IF NOT EXISTS vector;',
    ),
  );

  console.log('→ applying drizzle migrations…');
  if (existsSync(join(migrationsDir, 'meta', '_journal.json'))) {
    // Let real errors propagate — do NOT swallow them (that masked this very bug).
    await migrate(db, { migrationsFolder: migrationsDir });
  } else {
    console.warn('  (no generated migrations found — run `pnpm db:generate` first)');
  }

  console.log('→ applying manual SQL (RLS, constraints, app role, auth fns)…');
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
