import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow, inviteCleaner } from './helpers';
import type { OwnerContext } from './helpers';

/** Maintenance, notifications, pricing, workflows, audit. */
describe('Operations modules (e2e)', () => {
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

  // ---- maintenance ----------------------------------------------------------
  let ticketId: string;
  let vendorId: string;

  it('opens a ticket, assigns a vendor with access, resolves with cost', async () => {
    const vendor = await request(http as never)
      .post('/vendors')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Yiannis Plumbing', trade: 'plumber', phone: '+30697000000' });
    expect(vendor.status).toBe(201);
    vendorId = vendor.body.id;

    const ticket = await request(http as never)
      .post('/maintenance/tickets')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, title: 'Boiler leaking', priority: 5 });
    expect(ticket.status).toBe(201);
    ticketId = ticket.body.id;

    const assign = await request(http as never)
      .post(`/maintenance/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ vendorId, scheduledAt: daysFromNow(2), grantAccess: true });
    expect(assign.status).toBe(201);
    expect(assign.body.accessCredentialId).toBeTruthy(); // vendor got a door code

    const creds = await request(http as never)
      .get('/access/credentials')
      .query({ unitId })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(creds.body.length).toBeGreaterThanOrEqual(1);

    const resolve = await request(http as never)
      .post(`/maintenance/tickets/${ticketId}/resolve`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cost: 120.5 });
    expect(resolve.status).toBe(201);
    expect(resolve.body.status).toBe('resolved');
  });

  // ---- notifications ----------------------------------------------------------
  it('fans out to channels and dedupes on the idempotency key', async () => {
    const key = `arrival_${randomUUID().slice(0, 8)}`;
    const first = await request(http as never)
      .post('/notifications')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        recipientRef: 'guest:marco@test.it',
        template: 'pre_arrival',
        payload: { unit: 'Suite A' },
        channels: ['email', 'sms'],
        dedupeKey: key,
      });
    expect(first.status).toBe(201);
    expect(first.body.deduped).toBe(false);

    const deliveries = await request(http as never)
      .get(`/notifications/${first.body.notificationId}/deliveries`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(deliveries.body).toHaveLength(2); // email + sms

    const second = await request(http as never)
      .post('/notifications')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        recipientRef: 'guest:marco@test.it',
        template: 'pre_arrival',
        channels: ['email'],
        dedupeKey: key,
      });
    expect(second.body.deduped).toBe(true);
  });

  // ---- pricing ----------------------------------------------------------------
  it('rules-based pricing: last-minute low-occupancy discount, explainable', async () => {
    const rule = await request(http as never)
      .post('/pricing/rules')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        unitId,
        name: 'Last-minute low-occupancy discount',
        conditions: { leadTimeDays: { lt: 3 }, occupancy: { lt: 0.5 } },
        effect: { adjustPct: -15 },
        priority: 10,
      });
    expect(rule.status).toBe(201);

    const day = daysFromNow(1).slice(0, 10);
    const res = await request(http as never)
      .post('/pricing/suggestions/evaluate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, day, basePrice: 100 });
    expect(res.status).toBe(201);
    expect(Number(res.body.suggestedPrice)).toBe(85);
    expect(res.body.rationale).toHaveLength(1); // which rule fired, and why

    const accept = await request(http as never)
      .post(`/pricing/suggestions/${res.body.id}/accept`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(accept.body.status).toBe('accepted');
  });

  it('far-future dates do not match the last-minute rule', async () => {
    const res = await request(http as never)
      .post('/pricing/suggestions/evaluate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, day: daysFromNow(60).slice(0, 10), basePrice: 100 });
    expect(Number(res.body.suggestedPrice)).toBe(100); // untouched
    expect(res.body.rationale).toHaveLength(0);
  });

  // ---- workflows ----------------------------------------------------------------
  it('workflow definitions: create, list, disable', async () => {
    const wf = await request(http as never)
      .post('/workflows')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'On booking → turnover',
        triggerEvent: 'booking.confirmed',
        definition: { steps: [{ key: 'clean', action: 'tasks.createCleaning' }] },
      });
    expect(wf.status).toBe(201);

    const disabled = await request(http as never)
      .patch(`/workflows/${wf.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ enabled: false });
    expect(disabled.body.enabled).toBe(false);

    const runs = await request(http as never)
      .get('/workflows/runs')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(runs.status).toBe(200); // executed by the workers — empty here
  });

  // ---- audit ----------------------------------------------------------------
  it('the audit trail records domain actions; cleaners cannot read it', async () => {
    await request(http as never)
      .post('/bookings/confirm')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(40), checkOut: daysFromNow(42) });

    const audit = await request(http as never)
      .get('/audit')
      .query({ action: 'booking.confirmed' })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(audit.status).toBe(200);
    expect(audit.body.length).toBeGreaterThanOrEqual(1);

    const cleaner = await inviteCleaner(http, owner.token, owner.uniq);
    const denied = await request(http as never)
      .get('/audit')
      .set('Authorization', `Bearer ${cleaner.token}`);
    expect(denied.status).toBe(403);
  });
});
