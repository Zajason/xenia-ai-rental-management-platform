import { createFixture } from './setup.js';
import { afterAll, describe, expect, it } from 'vitest';
import { db, eq, pool, schema } from '@xenia/db';
import { runWorkflowsFor } from '../src/workflow-engine/engine.js';

/**
 * THE SPINE: booking.confirmed → workflow engine → cleaning task + access
 * credential, with the run and its steps persisted. This is the event-driven
 * loop that makes Xenia an operations platform rather than a CRUD app.
 */
describe('workflow engine', () => {
  afterAll(async () => pool.end());

  it('fans a booking.confirmed event out to cleaning + access + pre-arrival', async () => {
    const { orgId, unitId } = await createFixture();

    await db.insert(schema.workflows).values({
      orgId,
      name: 'On booking confirmed → turnover + access',
      triggerEvent: 'booking.confirmed',
      definition: {
        steps: [
          { key: 'create_cleaning', action: 'tasks.createCleaning' },
          { key: 'issue_access', action: 'access.issueCredential' },
          { key: 'start_prearrival', action: 'messaging.startPreArrivalSequence' },
        ],
      },
    });

    const checkIn = new Date(Date.now() + 2 * 86400_000).toISOString();
    const checkOut = new Date(Date.now() + 5 * 86400_000).toISOString();
    await runWorkflowsFor('booking.confirmed', orgId, { unitId, checkIn, checkOut });

    // 1. A cleaning task exists, due at checkout.
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.orgId, orgId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.type).toBe('cleaning');
    expect(tasks[0]!.dueAt?.toISOString()).toBe(checkOut);

    // 2. A pending access credential exists for the stay window.
    const creds = await db
      .select()
      .from(schema.accessCredentials)
      .where(eq(schema.accessCredentials.orgId, orgId));
    expect(creds).toHaveLength(1);
    expect(creds[0]!.status).toBe('pending');
    expect(creds[0]!.validFrom.toISOString()).toBe(checkIn);
    expect(creds[0]!.validTo.toISOString()).toBe(checkOut);

    // 3. The run completed with all three steps recorded.
    const runs = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.orgId, orgId));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('completed');
    const steps = await db.select().from(schema.runSteps).where(eq(schema.runSteps.runId, runs[0]!.id));
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('disabled workflows are skipped', async () => {
    const { orgId, unitId } = await createFixture();
    await db.insert(schema.workflows).values({
      orgId,
      name: 'Disabled',
      triggerEvent: 'booking.confirmed',
      enabled: false,
      definition: { steps: [{ key: 'x', action: 'tasks.createCleaning' }] },
    });
    await runWorkflowsFor('booking.confirmed', orgId, {
      unitId,
      checkIn: new Date().toISOString(),
      checkOut: new Date(Date.now() + 86400_000).toISOString(),
    });
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.orgId, orgId));
    expect(tasks).toHaveLength(0);
  });
});
