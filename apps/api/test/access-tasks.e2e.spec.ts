import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow, inviteCleaner } from './helpers';
import type { OwnerContext } from './helpers';

describe('Access & Tasks (e2e)', () => {
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

  // ---- access lifecycle -----------------------------------------------------
  let credentialId: string;

  it('registers a lock and issues a time-boxed credential (code returned once)', async () => {
    const lock = await request(http as never)
      .post('/access/locks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId });
    expect(lock.status).toBe(201);

    const res = await request(http as never)
      .post('/access/credentials')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, validFrom: daysFromNow(1), validTo: daysFromNow(4) });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body.credential.status).toBe('pending');
    expect(res.body.credential.secretRef).toContain('sim:');
    credentialId = res.body.credential.id;
  });

  it('issues a credential from a booking (window = the stay)', async () => {
    const booking = await request(http as never)
      .post('/bookings/confirm')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(30), checkOut: daysFromNow(33) });
    expect(booking.status).toBe(201);

    const res = await request(http as never)
      .post('/access/credentials')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ bookingId: booking.body.id });
    expect(res.status).toBe(201);
    expect(new Date(res.body.credential.validFrom).toISOString()).toBe(daysFromNow(30));
  });

  it('revokes a credential and writes the access-event trail', async () => {
    const res = await request(http as never)
      .post(`/access/credentials/${credentialId}/revoke`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('revoked');

    const events = await request(http as never)
      .get(`/access/credentials/${credentialId}/events`)
      .set('Authorization', `Bearer ${owner.token}`);
    const kinds = events.body.map((e: { event: string }) => e.event);
    expect(kinds).toContain('issued');
    expect(kinds).toContain('revoked');
  });

  it('rejects an inverted validity window (400)', async () => {
    const res = await request(http as never)
      .post('/access/credentials')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, validFrom: daysFromNow(5), validTo: daysFromNow(2) });
    expect(res.status).toBe(400);
  });

  // ---- cleaner task workflow --------------------------------------------------
  let taskId: string;
  let cleanerToken: string;
  let staffId: string;

  it('manager creates a cleaning task and assigns a cleaner', async () => {
    const cleaner = await inviteCleaner(http, owner.token, owner.uniq);
    cleanerToken = cleaner.token;

    const staff = await request(http as never)
      .post('/staff')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Nikos', role: 'cleaner', userId: cleaner.userId });
    staffId = staff.body.id;

    const task = await request(http as never)
      .post('/tasks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, type: 'cleaning', dueAt: daysFromNow(1) });
    expect(task.status).toBe(201);
    taskId = task.body.id;

    const assign = await request(http as never)
      .post(`/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ staffId });
    expect(assign.status).toBe(201);
  });

  it('RBAC: a cleaner cannot create staff (403)', async () => {
    const res = await request(http as never)
      .post('/staff')
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('the assigned cleaner accepts; a stranger cannot', async () => {
    const other = await inviteCleaner(http, owner.token, owner.uniq);
    const stranger = await request(http as never)
      .post(`/tasks/${taskId}/accept`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(stranger.status).toBe(403); // has no staff profile / not assigned

    const res = await request(http as never)
      .post(`/tasks/${taskId}/accept`)
      .set('Authorization', `Bearer ${cleanerToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');
  });

  it('completion flips the unit to ready', async () => {
    // Make the unit dirty first so the flip is observable.
    await request(http as never)
      .patch(`/units/${unitId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'dirty' });

    const res = await request(http as never)
      .post(`/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ photos: ['https://example.test/after.jpg'] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');

    const units = await request(http as never)
      .get('/units')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(units.body.find((u: { id: string }) => u.id === unitId).status).toBe('ready');
  });
});
