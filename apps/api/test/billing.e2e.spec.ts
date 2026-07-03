import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, inviteCleaner } from './helpers';
import type { OwnerContext } from './helpers';

/**
 * Billing: SaaS subscription (simulated Stripe Billing) + in-app payouts —
 * the owner paying a cleaner or a repair vendor through Xenia (simulated
 * Stripe Connect). Real-operation requirements: docs/integrations/billing.md.
 */
describe('Billing (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let owner: OwnerContext;
  let unitId: string;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    owner = await bootstrapOwner(http);
    ({ unitId } = await createUnit(http, owner.token));
  });
  afterAll(async () => app.close());

  // ---- subscription -----------------------------------------------------------
  it('starts with no subscription', async () => {
    const res = await request(http as never)
      .get('/billing/subscription')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body?.id).toBeUndefined(); // null → empty body over HTTP
  });

  it('checkout activates a per-unit subscription', async () => {
    const res = await request(http as never)
      .post('/billing/subscription/checkout')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ plan: 'pro' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.plan).toBe('pro');
    expect(res.body.unitCount).toBe(1); // metered on the org's units
    expect(res.body.stripeId).toContain('sim_sub_');
  });

  it('RBAC: only the owner manages the subscription (manager → 403)', async () => {
    // Invite a manager, then try checkout with their token.
    const email = `mgr_${owner.uniq}@xenia.test`;
    const invite = await request(http as never)
      .post('/auth/invitations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email, role: 'manager' });
    const accept = await request(http as never)
      .post('/auth/invitations/accept')
      .send({ token: invite.body.token, password: 'ManagerPass1!' });

    const res = await request(http as never)
      .post('/billing/subscription/checkout')
      .set('Authorization', `Bearer ${accept.body.accessToken}`)
      .send({ plan: 'scale' });
    expect(res.status).toBe(403);
  });

  it('provider webhooks: renewal with a valid signature, 401 without', async () => {
    const bad = await request(http as never)
      .post('/webhooks/billing')
      .set('x-billing-signature', 'wrong')
      .send({ type: 'invoice.paid', orgId: owner.orgId });
    expect(bad.status).toBe(401);

    const ok = await request(http as never)
      .post('/webhooks/billing')
      .set('x-billing-signature', process.env.BILLING_WEBHOOK_SECRET ?? 'dev-billing-secret')
      .send({ type: 'invoice.paid', orgId: owner.orgId });
    expect(ok.status).toBe(200);
    expect(ok.body.handled).toBe('invoice.paid');
  });

  it('cancellation via webhook', async () => {
    const res = await request(http as never)
      .post('/webhooks/billing')
      .set('x-billing-signature', process.env.BILLING_WEBHOOK_SECRET ?? 'dev-billing-secret')
      .send({ type: 'subscription.cancelled', orgId: owner.orgId });
    expect(res.body.handled).toBe('subscription.cancelled');

    const sub = await request(http as never)
      .get('/billing/subscription')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(sub.body.status).toBe('cancelled');
  });

  // ---- payouts: owner pays cleaner / vendor through the app --------------------
  it('pays a cleaner for a completed job', async () => {
    const cleaner = await inviteCleaner(http, owner.token, owner.uniq);
    const staff = await request(http as never)
      .post('/staff')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Nikos', role: 'cleaner', userId: cleaner.userId });

    const task = await request(http as never)
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, type: 'cleaning' });

    const payout = await request(http as never)
      .post('/billing/payouts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        payeeType: 'staff',
        payeeId: staff.body.id,
        amount: 45.5,
        taskId: task.body.id,
        note: 'Turnover cleaning — Suite A',
      });
    expect(payout.status).toBe(201);
    expect(payout.body.status).toBe('paid');
    expect(payout.body.providerRef).toContain('sim_tr_');
    expect(payout.body.amount).toBe('45.50');
    expect(payout.body.paidAt).toBeTruthy();
  });

  it('pays a repair vendor against a maintenance ticket', async () => {
    const vendor = await request(http as never)
      .post('/vendors')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Yiannis Plumbing', trade: 'plumber' });
    const ticket = await request(http as never)
      .post('/maintenance/tickets')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, title: 'Leaky tap' });

    const payout = await request(http as never)
      .post('/billing/payouts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        payeeType: 'vendor',
        payeeId: vendor.body.id,
        amount: 120,
        currency: 'eur',
        ticketId: ticket.body.id,
      });
    expect(payout.status).toBe(201);
    expect(payout.body.currency).toBe('EUR');

    const list = await request(http as never)
      .get('/billing/payouts')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(list.body).toHaveLength(2);
  });

  it('rejects a payout to a payee outside the org (404)', async () => {
    const res = await request(http as never)
      .post('/billing/payouts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ payeeType: 'staff', payeeId: randomUUID(), amount: 10 });
    expect(res.status).toBe(404);
  });

  it('rejects non-positive amounts (400)', async () => {
    const res = await request(http as never)
      .post('/billing/payouts')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ payeeType: 'staff', payeeId: randomUUID(), amount: -5 });
    expect(res.status).toBe(400);
  });

  it('payouts are recorded in the audit trail', async () => {
    const audit = await request(http as never)
      .get('/audit')
      .query({ action: 'billing.payout.paid' })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(audit.body.length).toBeGreaterThanOrEqual(2);
  });
});
