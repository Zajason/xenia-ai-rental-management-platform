-- Login needs to read a user's memberships BEFORE any tenant context exists, but
-- RLS on `memberships` hides rows unless app.current_org is set. A SECURITY
-- DEFINER function (owned by the privileged role) reads them safely, scoped to a
-- single user id. The app role may only EXECUTE it — it cannot read memberships
-- across tenants any other way.
CREATE OR REPLACE FUNCTION auth_user_memberships(p_user_id uuid)
RETURNS TABLE (org_id uuid, role member_role, org_slug text, org_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.org_id, m.role, o.slug, o.name
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION auth_user_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_user_memberships(uuid) TO xenia_app;
