// Force the AI service to be unreachable so the human-handoff fallback is
// exercised deterministically (locally the real service might be running).
process.env.AI_CONCIERGE_URL = 'http://127.0.0.1:59999';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, daysFromNow } from './helpers';
import type { OwnerContext } from './helpers';

describe('Messaging & Concierge (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let owner: OwnerContext;
  let unitId: string;
  let guestId: string;
  let conversationId: string;
  let guestToken: string;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    owner = await bootstrapOwner(http);
    ({ unitId } = await createUnit(http, owner.token));

    // Create a guest through the channel path (the natural way guests appear).
    const ch = await request(http as never)
      .post('/channels')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ type: 'airbnb', name: 'Airbnb' });
    await request(http as never)
      .post(`/webhooks/channels/${owner.orgId}/${ch.body.id}`)
      .set('x-channel-secret', ch.body.webhookSecret)
      .send({
        eventId: `evt_msg_${owner.uniq}`,
        type: 'booking.created',
        externalRef: 'HMMSG1',
        unitId,
        checkIn: daysFromNow(3),
        checkOut: daysFromNow(6),
        guest: { name: 'Marco Rossi', email: `marco_${owner.uniq}@test.it`, language: 'it' },
      });
    const bookings = await request(http as never)
      .get('/bookings')
      .set('Authorization', `Bearer ${owner.token}`);
    guestId = bookings.body[0].guestId;
  });
  afterAll(async () => app.close());

  it('staff creates a conversation bound to the stay', async () => {
    const res = await request(http as never)
      .post('/conversations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, guestId, channel: 'in_app' });
    expect(res.status).toBe(201);
    conversationId = res.body.id;
  });

  it('the guest authenticates via magic link', async () => {
    const issue = await request(http as never)
      .post('/auth/magic-links')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ subjectType: 'guest', subjectId: guestId });
    const verify = await request(http as never)
      .post('/auth/magic-links/verify')
      .send({ token: issue.body.token });
    expect(verify.status).toBe(200);
    guestToken = verify.body.accessToken;
  });

  it('guest message with the AI down → deterministic human handoff', async () => {
    const res = await request(http as never)
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ body: 'Ciao! Qual è la password del wifi?' });
    expect(res.status).toBe(201);
    expect(res.body.ai.escalated).toBe(true);

    const conversations = await request(http as never)
      .get('/conversations')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(conversations.body[0].status).toBe('handoff');

    const messages = await request(http as never)
      .get(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`);
    const senders = messages.body.map((m: { senderType: string }) => m.senderType);
    expect(senders).toContain('guest');
    expect(senders).toContain('system'); // "passed to your host" notice
  });

  it('a guest cannot post into someone else’s conversation (403)', async () => {
    const other = await request(http as never)
      .post('/conversations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ unitId, channel: 'in_app' }); // no guestId binding
    const res = await request(http as never)
      .post(`/conversations/${other.body.id}/messages`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ body: 'sneaky' });
    expect(res.status).toBe(403);
  });

  it('staff replies land as host messages without AI involvement', async () => {
    const res = await request(http as never)
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'The wifi password is sunset2024 — enjoy your stay!' });
    expect(res.status).toBe(201);
    expect(res.body.ai).toBeUndefined();
    expect(res.body.message.senderType).toBe('host');
  });

  it('manual concierge re-trigger endpoint also degrades to handoff', async () => {
    const res = await request(http as never)
      .post(`/concierge/conversations/${conversationId}/respond`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(201);
    expect(res.body.escalated).toBe(true);
  });
});
