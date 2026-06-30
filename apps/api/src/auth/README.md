# auth

The authentication & authorization service for Xenia. Identity is the root
bounded context; everything else depends on the principal it establishes.

## Model

- **Access tokens** — stateless JWT (HS256), short-lived (15m). Payload:
  `{ sub, org, role, scope }`. `scope` is `staff` (password session) or `magic`
  (passwordless guest/vendor/cleaner session).
- **Refresh tokens** — opaque random strings, only their sha256 is stored
  (`refresh_tokens`). Rotated on every use: the old one is revoked and linked to
  its replacement, so a stolen-and-reused token is detected and rejected.
- **Passwords** — argon2id (`@node-rs/argon2`, prebuilt, no native compile).

## Who authenticates how

| Role | Mechanism |
|------|-----------|
| owner / admin / manager / cleaner (staff) | email + password → access + refresh |
| cleaner / manager / admin (provisioning) | invitation token → accept → session |
| guest / vendor / cleaner (no account) | magic link → short-lived access token |

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | public | bootstrap an org + owner |
| POST | `/auth/login` | public | `{ email, password, orgSlug? }` |
| POST | `/auth/refresh` | public | rotate; old token invalidated |
| POST | `/auth/logout` | public | revoke a refresh token |
| GET | `/auth/me` | bearer | current principal |
| POST | `/auth/invitations` | manager+ | invite a user into the org |
| POST | `/auth/invitations/accept` | public | accept + set password |
| POST | `/auth/magic-links` | manager+ | issue a passwordless link |
| POST | `/auth/magic-links/verify` | public | exchange for an access token |

## Enforcement

- `JwtAuthGuard` (global) authenticates every route except `@Public()` ones and
  sets `req.orgId` so DB calls run inside the right tenant (RLS).
- `RolesGuard` (global) enforces `@Roles(...)`; `owner`/`admin` are org
  superusers and pass any role check.
- Multi-tenant note: login reads memberships via the `auth_user_memberships`
  SECURITY DEFINER function, the only way the app role can read across tenants —
  and only for a single user id.

## Tests

`pnpm --filter @xenia/api test` runs `test/auth.e2e.spec.ts` — the real Nest app
against local Postgres, covering every endpoint plus the negative/RBAC cases. No
frontend or curl needed. (Vitest uses the SWC plugin so Nest's DI metadata is
emitted.)
