// Must be imported FIRST in every workers test: selects the BYPASSRLS worker
// role before @xenia/db builds its pool (same as src/env.ts does at runtime).
import '../src/env.js';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@xenia/db';

/** Create an org + property + unit fixture directly (worker role bypasses RLS). */
export async function createFixture() {
  const uniq = randomUUID().slice(0, 8);
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: `Workers Test ${uniq}`, slug: `workers-${uniq}` })
    .returning();
  const [property] = await db
    .insert(schema.properties)
    .values({ orgId: org!.id, name: 'Test House' })
    .returning();
  const [unit] = await db
    .insert(schema.units)
    .values({ orgId: org!.id, propertyId: property!.id, name: 'Test Suite' })
    .returning();
  return { orgId: org!.id, propertyId: property!.id, unitId: unit!.id, uniq };
}
