import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, desc, eq, isNull, or, schema, sql, withTenant } from '@xenia/db';
import { evaluate } from '@xenia/shared';
import type { PricingRule } from '@xenia/shared';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const ruleSchema = z.object({
  unitId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  conditions: z.record(z.unknown()),
  effect: z.object({
    adjustPct: z.number().min(-90).max(300).optional(),
    adjustAbs: z.number().optional(),
    setMinNights: z.number().int().min(1).optional(),
  }),
  priority: z.number().int().min(0).max(100).optional(),
});

const evaluateSchema = z.object({
  unitId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basePrice: z.number().positive(),
});

/**
 * FEATURE: rules-based pricing suggestions. The pure evaluation engine lives in
 * @xenia/shared (used by both this module and the workers' scheduled sweep);
 * this service builds the day's context, runs it, and stores an EXPLAINABLE
 * suggestion (which rules fired and why).
 */
@Injectable()
export class PricingService {
  createRule(orgId: string, input: z.infer<typeof ruleSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.pricingRules)
        .values({
          orgId,
          unitId: input.unitId,
          name: input.name,
          conditions: input.conditions,
          effect: input.effect,
          priority: input.priority ?? 0,
        })
        .returning();
      return row;
    });
  }

  listRules(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.pricingRules));
  }

  async evaluateDay(orgId: string, input: z.infer<typeof evaluateSchema>) {
    const day = new Date(`${input.day}T00:00:00Z`);
    const now = new Date();

    // Context: lead time, forward occupancy (occupied days in the next 30), weekday.
    const horizon = new Date(now.getTime() + 30 * 86400_000);
    const occupied = await withTenant(orgId, (tx) =>
      tx
        .select({
          days: sql<number>`coalesce(sum(
            extract(epoch from
              least(${schema.availabilityBlocks.checkOut}, ${horizon.toISOString()}::timestamptz)
              - greatest(${schema.availabilityBlocks.checkIn}, ${now.toISOString()}::timestamptz)
            ) / 86400.0), 0)`,
        })
        .from(schema.availabilityBlocks)
        .where(
          and(
            eq(schema.availabilityBlocks.unitId, input.unitId),
            sql`tstzrange(${schema.availabilityBlocks.checkIn}, ${schema.availabilityBlocks.checkOut}, '[)') && tstzrange(${now.toISOString()}::timestamptz, ${horizon.toISOString()}::timestamptz, '[)')`,
          ),
        ),
    );
    const occupancy = Math.min(Math.max(Number(occupied[0]?.days ?? 0) / 30, 0), 1);

    const rules = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.pricingRules)
        .where(
          and(
            eq(schema.pricingRules.enabled, true),
            or(isNull(schema.pricingRules.unitId), eq(schema.pricingRules.unitId, input.unitId)),
          ),
        ),
    );

    const suggestion = evaluate(
      {
        basePrice: input.basePrice,
        leadTimeDays: Math.max(0, Math.round((day.getTime() - now.getTime()) / 86400_000)),
        occupancy,
        weekday: day.getUTCDay(),
        gapNights: 0,
      },
      rules.map(
        (r): PricingRule => ({
          id: r.id,
          conditions: r.conditions as Record<string, unknown>,
          effect: r.effect as PricingRule['effect'],
          priority: r.priority,
        }),
      ),
    );

    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.pricingSuggestions)
        .values({
          orgId,
          unitId: input.unitId,
          day: input.day,
          currentPrice: String(input.basePrice),
          suggestedPrice: String(suggestion.suggestedPrice),
          rationale: suggestion.rationale,
          status: 'suggested',
        })
        .returning();
      await tx.insert(schema.outbox).values({
        orgId,
        aggregate: 'pricing',
        eventType: 'pricing.suggestion.created',
        payload: { unitId: input.unitId, day: input.day, suggestedPrice: suggestion.suggestedPrice },
      });
      return { ...row, occupancyUsed: occupancy };
    });
  }

  listSuggestions(orgId: string, unitId?: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.pricingSuggestions)
        .where(unitId ? eq(schema.pricingSuggestions.unitId, unitId) : undefined)
        .orderBy(desc(schema.pricingSuggestions.createdAt)),
    );
  }

  accept(orgId: string, suggestionId: string) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.pricingSuggestions)
        .set({ status: 'accepted' })
        .where(eq(schema.pricingSuggestions.id, suggestionId))
        .returning();
      if (!row) throw new NotFoundException('Suggestion not found');
      // Accepted suggestion lands on the rate calendar.
      await tx.insert(schema.rateCalendar).values({
        orgId,
        unitId: row.unitId,
        day: row.day,
        price: row.suggestedPrice,
      });
      return row;
    });
  }
}

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('pricing')
class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Roles('manager')
  @Post('rules')
  createRule(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(ruleSchema)) body: z.infer<typeof ruleSchema>,
  ) {
    return this.pricing.createRule(orgId, body);
  }

  @Get('rules')
  listRules(@CurrentOrg() orgId: string) {
    return this.pricing.listRules(orgId);
  }

  @Roles('manager')
  @Post('suggestions/evaluate')
  evaluate(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(evaluateSchema)) body: z.infer<typeof evaluateSchema>,
  ) {
    return this.pricing.evaluateDay(orgId, body);
  }

  @Get('suggestions')
  listSuggestions(@CurrentOrg() orgId: string, @Query('unitId') unitId?: string) {
    return this.pricing.listSuggestions(orgId, unitId);
  }

  @Roles('manager')
  @Post('suggestions/:id/accept')
  accept(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.pricing.accept(orgId, id);
  }
}

@Module({ controllers: [PricingController], providers: [PricingService], exports: [PricingService] })
export class PricingModule {}
