import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow } from './helpers';
import type { OwnerContext } from './helpers';

/**
 * Guests are created by the channel ingestion path (see channels.e2e.spec.ts);
 * this suite covers the read-only directory the dashboard uses to resolve
 * guest names on bookings.
 */
describe('Guests (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let owner: OwnerContext;
  let unitId: string;
  let guestId: string;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    owner = await bootstrapOwner(http);
    ({ unitId } = await createUnit(http, owner.token));

    const ch = await request(http as never)
      .post('/channels')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ type: 'airbnb', name: 'Airbnb' });
    await request(http as never)
      .post(`/webhooks/channels/${owner.orgId}/${ch.body.id}`)
      .set('x-channel-secret', ch.body.webhookSecret)
      .send({
        eventId: `evt_guests_${owner.uniq}`,
        type: 'booking.created',
        externalRef: 'GUEST1',
        unitId,
        checkIn: daysFromNow(5),
        checkOut: daysFromNow(8),
        guest: { name: 'Marco Rossi', email: `marco_${owner.uniq}@test.it`, language: 'it' },
      });
    const bookings = await request(http as never)
      .get('/bookings')
      .set('Authorization', `Bearer ${owner.token}`);
    guestId = bookings.body[0].guestId;
  });
  afterAll(async () => app.close());

  it('requires authentication (401)', async () => {
    const res = await request(http as never).get('/guests');
    expect(res.status).toBe(401);
  });

  it('lists guests for the org', async () => {
    const res = await request(http as never)
      .get('/guests')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Marco Rossi');
    expect(res.body[0].email).toContain('marco_');
  });

  it('returns guest detail with their bookings', async () => {
    const res = await request(http as never)
      .get(`/guests/${guestId}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Marco Rossi');
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0].unitId).toBe(unitId);
  });

  it('404s for an unknown guest id', async () => {
    const res = await request(http as never)
      .get('/guests/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(404);
  });

  it('tenant isolation: another org sees no guests', async () => {
    const other = await bootstrapOwner(http);
    const res = await request(http as never)
      .get('/guests')
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.body).toHaveLength(0);
  });
});
