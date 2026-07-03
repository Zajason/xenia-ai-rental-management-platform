import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow } from './helpers';
import type { OwnerContext } from './helpers';

/**
 * The channel-manager exclusivity story, tested with DUMMY Airbnb/Booking.com
 * providers posting the same webhook envelope real adapters will use.
 * See docs/integrations/channels.md for what real operation requires.
 */
describe('Channel manager (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let owner: OwnerContext;
  let unitId: string;
  let airbnb: { id: string; webhookSecret: string };
  let bookingCom: { id: string; webhookSecret: string };

  const post = (channel: { id: string; webhookSecret: string }, body: object, secret?: string) =>
    request(http as never)
      .post(`/webhooks/channels/${owner.orgId}/${channel.id}`)
      .set('x-channel-secret', secret ?? channel.webhookSecret)
      .send(body);

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    owner = await bootstrapOwner(http);
    ({ unitId } = await createUnit(http, owner.token));

    const mk = async (type: string, name: string) => {
      const res = await request(http as never)
        .post('/channels')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ type, name });
      expect(res.status).toBe(201);
      expect(res.body.webhookSecret).toBeTruthy();
      return res.body;
    };
    airbnb = await mk('airbnb', 'Airbnb (dummy)');
    bookingCom = await mk('booking', 'Booking.com (dummy)');
  });
  afterAll(async () => app.close());

  it('rejects a webhook with a bad secret (401)', async () => {
    const res = await post(
      airbnb,
      { eventId: 'x', type: 'booking.cancelled', externalRef: 'r' },
      'wrong-secret',
    );
    expect(res.status).toBe(401);
  });

  it('ingests an Airbnb booking and creates the guest + booking', async () => {
    const res = await post(airbnb, {
      eventId: `evt_${owner.uniq}_1`,
      type: 'booking.created',
      externalRef: 'HMAIRBNB1',
      unitId,
      checkIn: daysFromNow(20),
      checkOut: daysFromNow(25),
      guest: { name: 'Marco Rossi', email: `marco_${owner.uniq}@test.it`, language: 'it' },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');
    expect(res.body.bookingId).toBeTruthy();

    const bookings = await request(http as never)
      .get('/bookings')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(bookings.body).toHaveLength(1);
    expect(bookings.body[0].guestId).toBeTruthy();
  });

  it('is idempotent: the same provider event id is a no-op duplicate', async () => {
    const res = await post(airbnb, {
      eventId: `evt_${owner.uniq}_1`, // same id as above
      type: 'booking.created',
      externalRef: 'HMAIRBNB1',
      unitId,
      checkIn: daysFromNow(20),
      checkOut: daysFromNow(25),
    });
    expect(res.body.status).toBe('duplicate');

    const bookings = await request(http as never)
      .get('/bookings')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(bookings.body).toHaveLength(1); // still exactly one
  });

  it('EXCLUSIVITY: an overlapping Booking.com reservation is recorded as a conflict, never double-booked', async () => {
    const res = await post(bookingCom, {
      eventId: `evt_${owner.uniq}_2`,
      type: 'booking.created',
      externalRef: 'BDC99',
      unitId,
      checkIn: daysFromNow(22), // inside the Airbnb stay
      checkOut: daysFromNow(24),
      guest: { name: 'Sophie Dubois', email: `sophie_${owner.uniq}@test.fr` },
    });
    expect(res.status).toBe(200); // providers get 200 — conflict handled internally
    expect(res.body.status).toBe('conflict');

    const bookings = await request(http as never)
      .get('/bookings')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(bookings.body).toHaveLength(1); // the DB refused the second booking

    // The conflict is surfaced in the audit trail for the operator.
    const audit = await request(http as never)
      .get('/audit')
      .query({ action: 'booking.conflict_detected' })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(audit.body.length).toBeGreaterThanOrEqual(1);
  });

  it('cancellation frees the dates; the other channel can then book them', async () => {
    const cancel = await post(airbnb, {
      eventId: `evt_${owner.uniq}_3`,
      type: 'booking.cancelled',
      externalRef: 'HMAIRBNB1',
    });
    expect(cancel.body.status).toBe('processed');

    const rebook = await post(bookingCom, {
      eventId: `evt_${owner.uniq}_4`,
      type: 'booking.created',
      externalRef: 'BDC100',
      unitId,
      checkIn: daysFromNow(22),
      checkOut: daysFromNow(24),
      guest: { name: 'Sophie Dubois', email: `sophie_${owner.uniq}@test.fr` },
    });
    expect(rebook.body.status).toBe('processed');
  });

  it('direct API bookings hit the same constraint (409)', async () => {
    const direct = await request(http as never)
      .post('/bookings/confirm')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, checkIn: daysFromNow(22), checkOut: daysFromNow(23) });
    expect(direct.status).toBe(409);
    expect(direct.body.code).toBe('BOOKING_CONFLICT');
  });

  it('unknown channel id → 404', async () => {
    const res = await request(http as never)
      .post(`/webhooks/channels/${owner.orgId}/${randomUUID()}`)
      .set('x-channel-secret', 'whatever')
      .send({ eventId: 'e', type: 'booking.cancelled', externalRef: 'r' });
    expect(res.status).toBe(404);
  });
});
