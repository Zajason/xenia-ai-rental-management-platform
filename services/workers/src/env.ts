import 'dotenv/config';

/**
 * MUST be imported before anything that touches @xenia/db.
 *
 * Workers are trusted infrastructure operating ACROSS tenants (outbox relay,
 * schedulers, the workflow engine) — under the RLS-enforced app role they would
 * see zero rows. They connect as the BYPASSRLS `xenia_worker` role instead.
 */
process.env.DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgres://xenia_worker:xenia_worker@localhost:5442/xenia';
