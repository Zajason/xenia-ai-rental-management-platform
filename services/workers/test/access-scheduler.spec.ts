import { createFixture } from './setup.js';
import { afterAll, describe, expect, it } from 'vitest';
import { db, eq, pool, schema } from '@xenia/db';
import { tickAccessLifecycle } from '../src/scheduler/access-scheduler.js';

/** The time-boxed credential lifecycle: pending → active → expired. */
describe('access scheduler', () => {
  afterAll(async () => pool.end());

  it('activates at validFrom and expires at validTo, with access events', async () => {
    const { orgId, unitId } = await createFixture();
    const [cred] = await db
      .insert(schema.accessCredentials)
      .values({
        orgId,
        unitId,
        type: 'code',
        validFrom: new Date(Date.now() - 3600_000), // window already open
        validTo: new Date(Date.now() + 3600_000),
        status: 'pending',
      })
      .returning();

    const first = await tickAccessLifecycle();
    expect(first.activated).toBeGreaterThanOrEqual(1);

    let [row] = await db
      .select()
      .from(schema.accessCredentials)
      .where(eq(schema.accessCredentials.id, cred!.id));
    expect(row!.status).toBe('active');

    // Time-travel: pull validTo into the past, tick again → expired.
    await db
      .update(schema.accessCredentials)
      .set({ validTo: new Date(Date.now() - 60_000) })
      .where(eq(schema.accessCredentials.id, cred!.id));
    const second = await tickAccessLifecycle();
    expect(second.expired).toBeGreaterThanOrEqual(1);

    [row] = await db
      .select()
      .from(schema.accessCredentials)
      .where(eq(schema.accessCredentials.id, cred!.id));
    expect(row!.status).toBe('expired');

    const events = await db
      .select()
      .from(schema.accessEvents)
      .where(eq(schema.accessEvents.credentialId, cred!.id));
    const kinds = events.map((e) => e.event);
    expect(kinds).toContain('granted');
    expect(kinds).toContain('expired');
  });

  it('does not touch future-dated credentials', async () => {
    const { orgId, unitId } = await createFixture();
    const [cred] = await db
      .insert(schema.accessCredentials)
      .values({
        orgId,
        unitId,
        type: 'code',
        validFrom: new Date(Date.now() + 86400_000),
        validTo: new Date(Date.now() + 2 * 86400_000),
        status: 'pending',
      })
      .returning();
    await tickAccessLifecycle();
    const [row] = await db
      .select()
      .from(schema.accessCredentials)
      .where(eq(schema.accessCredentials.id, cred!.id));
    expect(row!.status).toBe('pending');
  });
});
