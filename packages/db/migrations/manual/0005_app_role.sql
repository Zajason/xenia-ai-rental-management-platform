-- The application connects as a NON-superuser role so that RLS actually applies.
-- (Superusers and table owners with BYPASSRLS skip policies — so the app must be
-- neither.) Migrations/seed run as the privileged role; the running app uses
-- xenia_app. Idempotent so it is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xenia_app') THEN
    CREATE ROLE xenia_app LOGIN PASSWORD 'xenia_app';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO xenia_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO xenia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xenia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xenia_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xenia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xenia_app;
