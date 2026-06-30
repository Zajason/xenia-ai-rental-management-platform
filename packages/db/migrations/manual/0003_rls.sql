-- Row-Level Security: defence-in-depth tenant isolation.
--
-- Every table that has an `org_id` column gets RLS enabled and a policy that
-- only exposes rows where org_id = current_setting('app.current_org'). The app
-- sets that GUC per transaction via withTenant() (see src/client.ts). Even if an
-- ORM query forgets its WHERE clause, the database refuses to leak across tenants.
--
-- EXEMPTIONS: auth/credential tables are accessed by an unguessable secret token
-- BEFORE any tenant context exists (refresh-token rotation, magic-link and
-- invitation acceptance), so tenant-scoped RLS would make those lookups
-- impossible. They are intentionally excluded and protected by the secrecy of
-- the token instead. api_keys is included for the same reason.
--
-- The app role must NOT be the table owner / BYPASSRLS, or policies are skipped.

DO $$
DECLARE
  t text;
  exempt text[] := ARRAY['refresh_tokens', 'magic_links', 'invitations', 'api_keys'];
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
  LOOP
    IF t = ANY (exempt) THEN
      -- Undo any RLS a previous migration applied to an exempt table.
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', t);
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (org_id::text = current_setting('app.current_org', true))
        WITH CHECK (org_id::text = current_setting('app.current_org', true));
    $f$, t);
  END LOOP;
END $$;
