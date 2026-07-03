import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapOwner, createApp, createUnit, inviteCleaner } from './helpers';
import type { OwnerContext } from './helpers';

/**
 * Knowledge-base document CRUD + reindex trigger. These assertions hold whether
 * or not the Python AI service is running: the reindex call is best-effort, so
 * it returns { ok } either way and never 500s.
 */
describe('Knowledge base (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  let owner: OwnerContext;
  let unitId: string;
  let docId: string;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    owner = await bootstrapOwner(http);
    ({ unitId } = await createUnit(http, owner.token));
  });
  afterAll(async () => app.close());

  it('creates a knowledge document for a unit', async () => {
    const res = await request(http as never)
      .post('/kb/documents')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        unitId,
        title: 'House Manual',
        content: 'The boiler switch is in the hallway closet. Quiet hours are 23:00–08:00.',
        sourceType: 'manual',
      });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(1);
    docId = res.body.id;
  });

  it('lists documents for the unit', async () => {
    const res = await request(http as never)
      .get('/kb/documents')
      .query({ unitId })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('House Manual');
  });

  it('updates a document and bumps its version', async () => {
    const res = await request(http as never)
      .patch(`/kb/documents/${docId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ content: 'Updated: boiler is in the closet. Local guide: try Taverna Nikos.' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
  });

  it('reports chunk stats for the unit (0..n depending on AI service)', async () => {
    const res = await request(http as never)
      .get(`/kb/units/${unitId}/chunks`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.chunks).toBe('number');
  });

  it('reindex trigger returns cleanly (ok:true if AI up, ok:false if down)', async () => {
    const res = await request(http as never)
      .post(`/kb/units/${unitId}/reindex`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('ok');
  });

  it('adding a property fact does not error (triggers async reindex)', async () => {
    const res = await request(http as never)
      .post(`/units/${unitId}/facts`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ category: 'wifi', key: 'password', value: 'sunset2024' });
    expect(res.status).toBe(201);
  });

  it('RBAC: a cleaner cannot create knowledge documents (403)', async () => {
    const cleaner = await inviteCleaner(http, owner.token, owner.uniq);
    const res = await request(http as never)
      .post('/kb/documents')
      .set('Authorization', `Bearer ${cleaner.token}`)
      .send({ unitId, title: 'Nope', content: 'x' });
    expect(res.status).toBe(403);
  });

  it('deletes a document', async () => {
    const res = await request(http as never)
      .delete(`/kb/documents/${docId}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    const list = await request(http as never)
      .get('/kb/documents')
      .query({ unitId })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(list.body).toHaveLength(0);
  });
});
