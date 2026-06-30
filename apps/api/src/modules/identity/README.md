# identity

Users, organizations, memberships, RBAC, sessions, API keys, and magic links for
guests/vendors/cleaners who never sign up. Root of the dependency graph — depends
on nothing. Exposes `resolveTenant(ctx)` + the RBAC guard every other module uses.

- **Tables:** organizations, users, memberships, api_keys, magic_links, invitations.
- **Events:** `auth.user.created`, `auth.member.invited`.
- **Failure modes to guard:** token replay, magic-link leakage, tenant confusion.
