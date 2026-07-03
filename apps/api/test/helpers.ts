import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export interface OwnerContext {
  token: string;
  refreshToken: string;
  orgId: string;
  email: string;
  password: string;
  uniq: string;
}

/** Register a fresh org + owner; returns an authenticated context. */
export async function bootstrapOwner(http: unknown): Promise<OwnerContext> {
  const uniq = randomUUID().slice(0, 8);
  const email = `owner_${uniq}@xenia.test`;
  const password = 'Sup3rSecret!';
  const res = await request(http as never)
    .post('/auth/register')
    .send({ email, password, orgName: `Org ${uniq}` });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return {
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    orgId: res.body.org.id,
    email,
    password,
    uniq,
  };
}

/** Create a property with one unit; returns their ids. */
export async function createUnit(
  http: unknown,
  token: string,
): Promise<{ propertyId: string; unitId: string }> {
  const prop = await request(http as never)
    .post('/properties')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Prop ${randomUUID().slice(0, 6)}`, timezone: 'Europe/Athens' });
  if (prop.status !== 201) throw new Error(`property failed: ${JSON.stringify(prop.body)}`);
  const unit = await request(http as never)
    .post(`/properties/${prop.body.id}/units`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Suite A', capacity: 2 });
  if (unit.status !== 201) throw new Error(`unit failed: ${JSON.stringify(unit.body)}`);
  return { propertyId: prop.body.id, unitId: unit.body.id };
}

/** Invite + accept a cleaner; returns their session token and userId. */
export async function inviteCleaner(
  http: unknown,
  ownerToken: string,
  uniq: string,
): Promise<{ token: string; userId: string; email: string }> {
  const email = `cleaner_${uniq}_${randomUUID().slice(0, 4)}@xenia.test`;
  const invite = await request(http as never)
    .post('/auth/invitations')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ email, role: 'cleaner' });
  const accept = await request(http as never)
    .post('/auth/invitations/accept')
    .send({ token: invite.body.token, password: 'CleanerPass1!', name: 'Test Cleaner' });
  if (accept.status !== 200) throw new Error(`accept failed: ${JSON.stringify(accept.body)}`);
  return { token: accept.body.accessToken, userId: accept.body.user.id, email };
}

/** Future date helper: now + n days, at a stable hour. */
export function daysFromNow(n: number): string {
  const d = new Date(Date.now() + n * 86400_000);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}
