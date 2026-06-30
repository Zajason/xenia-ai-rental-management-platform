# access

The smart-lock credential lifecycle: issue → scheduled-activate at check-in →
auto-revoke at checkout, with a full audit trail and a reconciliation job that
repairs drift against the real lock. Abstracts vendors behind a `LockProvider`
interface (simulator | seam). Depends on booking, identity.

- **Tables:** locks, access_credentials, access_events.
- **Events:** `access.granted`, `access.used`, `access.expired`, `access.revoked`.
- **Failure modes:** code active too early/late, failure to revoke (security
  incident), offline lock, vendor API failure.
