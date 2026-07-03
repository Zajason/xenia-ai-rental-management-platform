-- Background workers (outbox relay, schedulers, workflow engine) are trusted
-- infrastructure that operates ACROSS tenants — under the RLS-enforced app role
-- they would see zero rows and silently do nothing. They get a dedicated role
-- with BYPASSRLS (but not superuser): stronger than connecting as the admin
-- role, weaker than app-level RLS. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xenia_worker') THEN
    CREATE ROLE xenia_worker LOGIN PASSWORD 'xenia_worker' BYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO xenia_worker', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO xenia_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xenia_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xenia_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xenia_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xenia_worker;
