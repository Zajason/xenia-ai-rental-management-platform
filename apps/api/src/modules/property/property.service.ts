import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, withTenant } from '@xenia/db';
import { KbService } from '../kb/kb.module.js';

@Injectable()
export class PropertyService {
  constructor(private readonly kb: KbService) {}

  createProperty(orgId: string, input: { name: string; address?: string; timezone?: string }) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.properties)
        .values({ orgId, name: input.name, address: input.address, timezone: input.timezone ?? 'UTC' })
        .returning();
      return row;
    });
  }

  listProperties(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.properties));
  }

  createUnit(
    orgId: string,
    propertyId: string,
    input: { name: string; capacity?: number; bedrooms?: number },
  ) {
    return withTenant(orgId, async (tx) => {
      const [prop] = await tx
        .select()
        .from(schema.properties)
        .where(eq(schema.properties.id, propertyId));
      if (!prop) throw new NotFoundException('Property not found');
      const [row] = await tx
        .insert(schema.units)
        .values({
          orgId,
          propertyId,
          name: input.name,
          capacity: input.capacity ?? 2,
          bedrooms: input.bedrooms ?? 1,
        })
        .returning();
      return row;
    });
  }

  listUnits(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.units));
  }

  updateUnit(orgId: string, unitId: string, input: { status?: 'ready' | 'dirty' | 'maintenance' | 'blocked'; name?: string }) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.units)
        .set(input)
        .where(eq(schema.units.id, unitId))
        .returning();
      if (!row) throw new NotFoundException('Unit not found');
      return row;
    });
  }

  async addFact(orgId: string, unitId: string, input: { category: string; key: string; value: string }) {
    const row = await withTenant(orgId, async (tx) => {
      const [created] = await tx
        .insert(schema.propertyFacts)
        .values({ orgId, unitId, ...input })
        .returning();
      return created;
    });
    // A new/changed fact changes what the AI knows → rebuild that unit's index
    // (fire-and-forget; best-effort if the AI service is down).
    this.kb.reindexUnitAsync(orgId, unitId);
    return row;
  }

  listFacts(orgId: string, unitId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.propertyFacts)
        .where(and(eq(schema.propertyFacts.unitId, unitId))),
    );
  }
}
