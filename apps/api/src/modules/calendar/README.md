# calendar

Single source of truth for what is bookable when: availability blocks, holds, and
conflict detection. The no-overlap invariant is enforced by the Postgres
exclusion constraint on `availability_blocks` (see @xenia/db). Depends on booking.

- **Tables:** availability_blocks, holds, rate_calendar.
- **Events:** `availability.blocked`, `availability.conflict`.
- **Failure modes:** concurrent channel writes racing for the same nights — solved
  at the DB layer, surfaced (not hidden) as conflicts.
