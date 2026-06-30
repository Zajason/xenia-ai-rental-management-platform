# apps/cleaner-pwa

The cleaner / turnover-staff mobile app — an installable **PWA** (no app store).
A cleaner signs in via magic link and gets a simple, offline-tolerant flow:

  see today's jobs → accept → open the checklist → upload before/after photos →
  mark complete → unit becomes "ready" (which unblocks the next access code).

Push notifications (and WhatsApp fallback) tell them when a job is assigned or
changed. Deliberately a PWA, not native, to avoid app-store overhead and keep one
codebase.

**Status:** scaffolded as a folder + spec. Build as a Next.js PWA (or route group
in `apps/web`) in Phase 2. No `package.json` yet, so it is excluded from the
workspace until then.
