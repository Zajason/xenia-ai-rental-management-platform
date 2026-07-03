import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, eq, schema, sql, withTenant } from '@xenia/db';
import { BookingConflictError } from '@xenia/shared';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const blockSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
});

@Injectable()
export class CalendarService {
  listBlocks(orgId: string, unitId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.availabilityBlocks)
        .where(eq(schema.availabilityBlocks.unitId, unitId)),
    );
  }

  async createManualBlock(orgId: string, input: { unitId: string; checkIn: Date; checkOut: Date }) {
    try {
      return await withTenant(orgId, async (tx) => {
        const [row] = await tx
          .insert(schema.availabilityBlocks)
          .values({ orgId, unitId: input.unitId, source: 'manual', checkIn: input.checkIn, checkOut: input.checkOut })
          .returning();
        return row;
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23P01') throw new BookingConflictError();
      throw err;
    }
  }

  async removeBlock(orgId: string, blockId: string) {
    await withTenant(orgId, (tx) =>
      tx.delete(schema.availabilityBlocks).where(eq(schema.availabilityBlocks.id, blockId)),
    );
    return { ok: true };
  }

  /** Overlap check via the same half-open-range semantics the constraint uses. */
  async checkAvailability(orgId: string, unitId: string, checkIn: Date, checkOut: Date) {
    const conflicts = await withTenant(orgId, (tx) =>
      tx
        .select({ id: schema.availabilityBlocks.id, source: schema.availabilityBlocks.source })
        .from(schema.availabilityBlocks)
        .where(
          and(
            eq(schema.availabilityBlocks.unitId, unitId),
            sql`tstzrange(${schema.availabilityBlocks.checkIn}, ${schema.availabilityBlocks.checkOut}, '[)') && tstzrange(${checkIn.toISOString()}::timestamptz, ${checkOut.toISOString()}::timestamptz, '[)')`,
          ),
        ),
    );
    return { available: conflicts.length === 0, conflicts };
  }
}

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('units/:unitId/blocks')
  listBlocks(@CurrentOrg() orgId: string, @Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.calendar.listBlocks(orgId, unitId);
  }

  @Roles('manager')
  @Post('blocks')
  createBlock(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(blockSchema)) body: z.infer<typeof blockSchema>,
  ) {
    return this.calendar.createManualBlock(orgId, {
      unitId: body.unitId,
      checkIn: new Date(body.checkIn),
      checkOut: new Date(body.checkOut),
    });
  }

  @Roles('manager')
  @Delete('blocks/:id')
  removeBlock(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) blockId: string) {
    return this.calendar.removeBlock(orgId, blockId);
  }

  @Get('units/:unitId/availability')
  checkAvailability(
    @CurrentOrg() orgId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.calendar.checkAvailability(orgId, unitId, new Date(checkIn), new Date(checkOut));
  }
}

@Module({ controllers: [CalendarController], providers: [CalendarService], exports: [CalendarService] })
export class CalendarModule {}
