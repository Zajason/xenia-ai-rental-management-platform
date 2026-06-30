import { and, eq, lte, db, schema } from '@xenia/db';

/**
 * Drives the time-boxed access-credential lifecycle. On each tick:
 *   - pending credentials whose validFrom has passed  → activate (provision lock)
 *   - active credentials whose validTo has passed      → expire (revoke on lock)
 *
 * Every transition writes an access_event (and, in the full build, an
 * audit_event). A separate reconciliation job compares this table to the real
 * lock state and repairs drift — the safety net for a system that unlocks doors.
 */
export async function tickAccessLifecycle(now = new Date()): Promise<{ activated: number; expired: number }> {
  const toActivate = await db
    .select()
    .from(schema.accessCredentials)
    .where(and(eq(schema.accessCredentials.status, 'pending'), lte(schema.accessCredentials.validFrom, now)));

  for (const cred of toActivate) {
    // TODO: call LockProvider.issue(cred) (simulator | seam).
    await db
      .update(schema.accessCredentials)
      .set({ status: 'active' })
      .where(eq(schema.accessCredentials.id, cred.id));
    await db.insert(schema.accessEvents).values({
      orgId: cred.orgId,
      credentialId: cred.id,
      lockId: cred.lockId,
      event: 'granted',
      actor: 'scheduler',
    });
  }

  const toExpire = await db
    .select()
    .from(schema.accessCredentials)
    .where(and(eq(schema.accessCredentials.status, 'active'), lte(schema.accessCredentials.validTo, now)));

  for (const cred of toExpire) {
    // TODO: call LockProvider.revoke(cred).
    await db
      .update(schema.accessCredentials)
      .set({ status: 'expired' })
      .where(eq(schema.accessCredentials.id, cred.id));
    await db.insert(schema.accessEvents).values({
      orgId: cred.orgId,
      credentialId: cred.id,
      lockId: cred.lockId,
      event: 'expired',
      actor: 'scheduler',
    });
  }

  return { activated: toActivate.length, expired: toExpire.length };
}
