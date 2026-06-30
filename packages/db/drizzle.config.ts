import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // drizzle-kit needs the privileged role to create/alter schema objects.
    url:
      process.env.DATABASE_ADMIN_URL ??
      process.env.DATABASE_URL ??
      'postgres://xenia:xenia@localhost:5442/xenia',
  },
  // We hand-write the RLS policies and the range-exclusion constraint as SQL
  // migrations (drizzle-kit can't express EXCLUDE USING gist), so we keep
  // generated migrations and custom SQL side by side in ./migrations.
  verbose: true,
  strict: true,
});
