import { eq, db, schema, withTenant } from '@xenia/db';

/**
 * The workflow engine — the conductor. It consumes a domain event, finds the
 * enabled workflows whose trigger matches, and executes their steps with
 * per-step status tracking, retries, and (for write steps) recorded compensation
 * so a later failure can roll earlier steps back (saga pattern).
 *
 * This MVP version executes synchronously with stubbed actions; the real build
 * dispatches each action as its own BullMQ job and persists run/step rows.
 */
type ActionFn = (ctx: WorkflowContext) => Promise<unknown>;

interface WorkflowContext {
  orgId: string;
  payload: Record<string, unknown>;
}

// Registry of step actions a workflow definition can reference by name.
const ACTIONS: Record<string, ActionFn> = {
  'tasks.createCleaning': async (ctx) => {
    return withTenant(ctx.orgId, (tx) =>
      tx
        .insert(schema.tasks)
        .values({
          orgId: ctx.orgId,
          unitId: ctx.payload.unitId as string,
          bookingId: (ctx.payload.bookingId as string) ?? null,
          type: 'cleaning',
          status: 'pending',
          dueAt: ctx.payload.checkOut ? new Date(ctx.payload.checkOut as string) : null,
        })
        .returning(),
    );
  },
  'access.issueCredential': async (ctx) => {
    return withTenant(ctx.orgId, (tx) =>
      tx
        .insert(schema.accessCredentials)
        .values({
          orgId: ctx.orgId,
          unitId: ctx.payload.unitId as string,
          bookingId: (ctx.payload.bookingId as string) ?? null,
          type: 'code',
          validFrom: new Date(ctx.payload.checkIn as string),
          validTo: new Date(ctx.payload.checkOut as string),
          status: 'pending',
        })
        .returning(),
    );
  },
  'messaging.startPreArrivalSequence': async () => {
    // Stub: enqueue templated pre-arrival messages on a delay.
    return { scheduled: true };
  },
};

export async function runWorkflowsFor(
  triggerEvent: string,
  orgId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const workflows = await withTenant(orgId, (tx) =>
    tx
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.triggerEvent, triggerEvent)),
  );

  for (const wf of workflows) {
    if (!wf.enabled) continue;
    const [run] = await withTenant(orgId, (tx) =>
      tx
        .insert(schema.workflowRuns)
        .values({ orgId, workflowId: wf.id, triggerPayload: payload, status: 'running', startedAt: new Date() })
        .returning(),
    );

    const def = wf.definition as { steps: { key: string; action: string }[] };
    try {
      for (const step of def.steps) {
        const action = ACTIONS[step.action];
        const output = action ? await action({ orgId, payload }) : { skipped: step.action };
        await withTenant(orgId, (tx) =>
          tx.insert(schema.runSteps).values({
            orgId,
            runId: run!.id,
            stepKey: step.key,
            status: 'completed',
            attempts: 1,
            output: output as Record<string, unknown>,
          }),
        );
      }
      await db
        .update(schema.workflowRuns)
        .set({ status: 'completed', finishedAt: new Date() })
        .where(eq(schema.workflowRuns.id, run!.id));
    } catch (err) {
      await db
        .update(schema.workflowRuns)
        .set({ status: 'failed', finishedAt: new Date() })
        .where(eq(schema.workflowRuns.id, run!.id));
      console.error(`[workflow ${wf.name}] failed`, err);
      // TODO: run compensation for completed steps in reverse order.
    }
  }
}
