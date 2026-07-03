import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow, inviteCleaner } from './helpers';
import type { OwnerContext } from './helpers';

describe('Property & Calendar (e2e)', () => {
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

  it('lists properties and units for the org', async () => {
    const props = await request(http as never)
      .get('/properties')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(props.status).toBe(200);
    expect(props.body).toHaveLength(1);

    const units = await request(http as never)
      .get('/units')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(units.body).toHaveLength(1);
    expect(units.body[0].status).toBe('ready');
  });

  it('adds and lists unit facts', async () => {
    const add = await request(http as never)
      .post(`/units/${unitId}/facts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ category: 'wifi', key: 'password', value: 'sunset2024' });
    expect(add.status).toBe(201);

    const list = await request(http as never)
      .get(`/units/${unitId}/facts`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].value).toBe('sunset2024');
  });

  it('updates unit status', async () => {
    const res = await request(http as never)
      .patch(`/units/${unitId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'dirty' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dirty');
  });

  it('RBAC: a cleaner cannot create properties (403)', async () => {
    const cleaner = await inviteCleaner(http, owner.token, owner.uniq);
    const res = await request(http as never)
      .post('/properties')
      .set('Authorization', `Bearer ${cleaner.token}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('tenant isolation: another org sees no units', async () => {
    const other = await bootstrapOwner(http);
    const res = await request(http as never)
      .get('/units')
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.body).toHaveLength(0);
  });

  // --- calendar ---
  it('creates a manual block and rejects an overlapping one with 409', async () => {
    const block = await request(http as never)
      .post('/calendar/blocks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(10), checkOut: daysFromNow(13) });
    expect(block.status).toBe(201);

    const overlap = await request(http as never)
      .post('/calendar/blocks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(11), checkOut: daysFromNow(12) });
    expect(overlap.status).toBe(409);
    expect(overlap.body.code).toBe('BOOKING_CONFLICT');
  });

  it('availability query reflects blocks; back-to-back is allowed', async () => {
    const busy = await request(http as never)
      .get(`/calendar/units/${unitId}/availability`)
      .query({ checkIn: daysFromNow(11), checkOut: daysFromNow(12) })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(busy.body.available).toBe(false);

    // Same-day turnover: [10,13) then [13,15) must NOT conflict.
    const backToBack = await request(http as never)
      .post('/calendar/blocks')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(13), checkOut: daysFromNow(15) });
    expect(backToBack.status).toBe(201);
  });

  it('deleting a block frees the dates', async () => {
    const blocks = await request(http as never)
      .get(`/calendar/units/${unitId}/blocks`)
      .set('Authorization', `Bearer ${owner.token}`);
    const first = blocks.body[0];
    await request(http as never)
      .delete(`/calendar/blocks/${first.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const free = await request(http as never)
      .get(`/calendar/units/${unitId}/availability`)
      .query({ checkIn: first.checkIn, checkOut: first.checkOut })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(free.body.available).toBe(true);
  });
});
