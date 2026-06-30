-- Runs once, as the superuser, when the Postgres volume is first created.
-- Creates the extensions and the non-superuser app role up front so the app can
-- connect even before migrations run. Migrations (0005_app_role.sql) re-assert
-- the role idempotently.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xenia_app') THEN
    CREATE ROLE xenia_app LOGIN PASSWORD 'xenia_app';
  END IF;
END $$;

GRANT CONNECT ON DATABASE xenia TO xenia_app;
GRANT USAGE ON SCHEMA public TO xenia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xenia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xenia_app;
