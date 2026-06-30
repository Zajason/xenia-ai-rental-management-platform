import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * End-to-end tests for the auth service. They run the REAL Nest app against the
 * local Postgres (defaults to xenia_app@5442), so you can debug and exercise
 * every endpoint with `pnpm --filter @xenia/api test` — no frontend, no curl.
 *
 * Each run uses unique emails/org names, so it is safe to run repeatedly.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof app.getHttpServer>;

  const uniq = randomUUID().slice(0, 8);
  const owner = { email: `owner_${uniq}@xenia.test`, password: 'Sup3rSecret!', orgName: `Org ${uniq}` };

  let accessToken = '';
  let refreshToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- health is public ------------------------------------------------------
  it('GET /health is public', async () => {
    const res = await request(http).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // --- registration ----------------------------------------------------------
  it('POST /auth/register creates an org + owner and returns tokens', async () => {
    const res = await request(http).post('/auth/register').send(owner);
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('owner');
    expect(res.body.org.slug).toContain('org');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/register rejects a duplicate email (409)', async () => {
    const res = await request(http).post('/auth/register').send(owner);
    expect(res.status).toBe(409);
  });

  it('POST /auth/register validates input (400)', async () => {
    const res = await request(http).post('/auth/register').send({ email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
  });

  // --- login -----------------------------------------------------------------
  it('POST /auth/login rejects a wrong password (401)', async () => {
    const res = await request(http)
      .post('/auth/login')
      .send({ email: owner.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login rejects an unknown user (401)', async () => {
    const res = await request(http)
      .post('/auth/login')
      .send({ email: `ghost_${uniq}@xenia.test`, password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login succeeds with correct credentials', async () => {
    const res = await request(http)
      .post('/auth/login')
      .send({ email: owner.email, password: owner.password });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  // --- protected /me ---------------------------------------------------------
  it('GET /auth/me requires a token (401)', async () => {
    const res = await request(http).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns the principal with a valid token', async () => {
    const res = await request(http).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(owner.email);
    expect(res.body.role).toBe('owner');
  });

  it('GET /auth/me rejects a garbage token (401)', async () => {
    const res = await request(http).get('/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  // --- refresh rotation ------------------------------------------------------
  it('POST /auth/refresh rotates tokens; the old refresh token is then invalid', async () => {
    const used = refreshToken;
    const res = await request(http).post('/auth/refresh').send({ refreshToken: used });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(used);

    // Reusing the rotated-out token must fail (theft detection).
    const reuse = await request(http).post('/auth/refresh').send({ refreshToken: used });
    expect(reuse.status).toBe(401);

    refreshToken = res.body.refreshToken;
    accessToken = res.body.accessToken;
  });

  // --- logout ----------------------------------------------------------------
  it('POST /auth/logout revokes the refresh token', async () => {
    const res = await request(http).post('/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);
    const after = await request(http).post('/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);
  });

  // --- protected resource respects auth -------------------------------------
  it('GET /bookings requires authentication (401)', async () => {
    const res = await request(http).get('/bookings');
    expect(res.status).toBe(401);
  });

  // --- invitations + RBAC ----------------------------------------------------
  let cleanerToken = '';
  it('POST /auth/invitations lets an owner invite a cleaner', async () => {
    // re-login for a fresh access token
    const login = await request(http)
      .post('/auth/login')
      .send({ email: owner.email, password: owner.password });
    accessToken = login.body.accessToken;

    const res = await request(http)
      .post('/auth/invitations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: `cleaner_${uniq}@xenia.test`, role: 'cleaner' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();

    const accept = await request(http)
      .post('/auth/invitations/accept')
      .send({ token: res.body.token, password: 'CleanerPass1!', name: 'Nikos' });
    expect(accept.status).toBe(200);
    expect(accept.body.role).toBe('cleaner');
    cleanerToken = accept.body.accessToken;
  });

  it('RBAC: a cleaner cannot create invitations (403)', async () => {
    const res = await request(http)
      .post('/auth/invitations')
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ email: `x_${uniq}@xenia.test`, role: 'manager' });
    expect(res.status).toBe(403);
  });

  it('POST /auth/invitations/accept rejects a bad token (400)', async () => {
    const res = await request(http)
      .post('/auth/invitations/accept')
      .send({ token: 'nonsense', password: 'CleanerPass1!' });
    expect(res.status).toBe(400);
  });

  // --- magic links (passwordless guest) -------------------------------------
  it('issues and verifies a guest magic link', async () => {
    const guestSubjectId = randomUUID();
    const issue = await request(http)
      .post('/auth/magic-links')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ subjectType: 'guest', subjectId: guestSubjectId, ttlMinutes: 60 });
    expect(issue.status).toBe(201);
    expect(issue.body.token).toBeTruthy();

    const verify = await request(http)
      .post('/auth/magic-links/verify')
      .send({ token: issue.body.token });
    expect(verify.status).toBe(200);
    expect(verify.body.role).toBe('guest');
    expect(verify.body.accessToken).toBeTruthy();

    // A guest token authenticates /me as a magic-scope principal.
    const me = await request(http)
      .get('/auth/me')
      .set('Authorization', `Bearer ${verify.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('guest');

    // Single-use: verifying the same token again fails.
    const reuse = await request(http)
      .post('/auth/magic-links/verify')
      .send({ token: issue.body.token });
    expect(reuse.status).toBe(401);
  });

  it('RBAC: a cleaner cannot issue magic links (403)', async () => {
    const res = await request(http)
      .post('/auth/magic-links')
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ subjectType: 'guest', subjectId: randomUUID() });
    expect(res.status).toBe(403);
  });
});
