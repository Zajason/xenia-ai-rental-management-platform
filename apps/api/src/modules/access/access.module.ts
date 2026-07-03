import {
  BadRequestException,
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
import { and, desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.module.js';
import { SimulatedLockProvider } from './lock.provider.js';

const createLockSchema = z.object({
  unitId: z.string().uuid(),
  provider: z.enum(['simulator', 'seam']).optional(),
});

const issueSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional(),
    type: z.enum(['code', 'nfc', 'mobile_key']).optional(),
  })
  .refine((v) => v.bookingId || (v.unitId && v.validFrom && v.validTo), {
    message: 'Provide bookingId, or unitId + validFrom + validTo',
  });

@Injectable()
export class AccessService {
  constructor(
    private readonly locks: SimulatedLockProvider,
    private readonly audit: AuditService,
  ) {}

  createLock(orgId: string, input: { unitId: string; provider?: string }) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.locks)
        .values({ orgId, unitId: input.unitId, provider: input.provider ?? 'simulator', status: 'online', battery: 100 })
        .returning();
      return row;
    });
  }

  listLocks(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.locks));
  }

  /**
   * Issue a time-boxed credential. Created `pending`; the workers' scheduler
   * activates it at validFrom and expires it at validTo. The plaintext code is
   * returned exactly once — only a provider ref is stored (vault ref in prod).
   */
  async issueCredential(
    orgId: string,
    input: { bookingId?: string; unitId?: string; validFrom?: Date; validTo?: Date; type?: 'code' | 'nfc' | 'mobile_key' },
  ) {
    let unitId = input.unitId;
    let validFrom = input.validFrom;
    let validTo = input.validTo;
    let bookingId = input.bookingId ?? null;

    if (input.bookingId) {
      const [booking] = await withTenant(orgId, (tx) =>
        tx.select().from(schema.bookings).where(eq(schema.bookings.id, input.bookingId!)),
      );
      if (!booking) throw new NotFoundException('Booking not found');
      unitId = booking.unitId;
      validFrom = booking.checkIn;
      validTo = booking.checkOut;
    }
    if (!unitId || !validFrom || !validTo) throw new BadRequestException('Incomplete window');
    if (validTo.getTime() <= validFrom.getTime()) {
      throw new BadRequestException('validTo must be after validFrom');
    }

    const [lock] = await withTenant(orgId, (tx) =>
      tx.select().from(schema.locks).where(eq(schema.locks.unitId, unitId!)),
    );

    const issued = await this.locks.issueCode(lock?.id ?? null, validFrom, validTo);

    const credential = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.accessCredentials)
        .values({
          orgId,
          unitId: unitId!,
          lockId: lock?.id ?? null,
          bookingId,
          type: input.type ?? 'code',
          secretRef: issued.ref,
          validFrom: validFrom!,
          validTo: validTo!,
          status: 'pending',
        })
        .returning();
      await tx.insert(schema.accessEvents).values({
        orgId,
        credentialId: row!.id,
        lockId: lock?.id ?? null,
        event: 'issued',
        actor: 'api',
      });
      return row;
    });

    await this.audit.record(orgId, {
      actorType: 'user',
      action: 'access.credential.issued',
      resourceType: 'access_credential',
      resourceId: credential!.id,
      after: { unitId, validFrom, validTo },
    });

    // The one and only time the plaintext code leaves the system.
    return { credential, code: issued.code };
  }

  async revokeCredential(orgId: string, credentialId: string) {
    const credential = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.accessCredentials)
        .set({ status: 'revoked' })
        .where(eq(schema.accessCredentials.id, credentialId))
        .returning();
      if (!row) throw new NotFoundException('Credential not found');
      await tx.insert(schema.accessEvents).values({
        orgId,
        credentialId: row.id,
        lockId: row.lockId,
        event: 'revoked',
        actor: 'api',
      });
      return row;
    });
    if (credential.secretRef) await this.locks.revoke(credential.lockId, credential.secretRef);
    await this.audit.record(orgId, {
      actorType: 'user',
      action: 'access.credential.revoked',
      resourceType: 'access_credential',
      resourceId: credentialId,
    });
    return credential;
  }

  listCredentials(orgId: string, filters: { bookingId?: string; unitId?: string }) {
    const conds = [
      filters.bookingId ? eq(schema.accessCredentials.bookingId, filters.bookingId) : undefined,
      filters.unitId ? eq(schema.accessCredentials.unitId, filters.unitId) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.accessCredentials)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(schema.accessCredentials.createdAt)),
    );
  }

  listEvents(orgId: string, credentialId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.accessEvents)
        .where(eq(schema.accessEvents.credentialId, credentialId))
        .orderBy(desc(schema.accessEvents.at)),
    );
  }
}

@ApiTags('access')
@ApiBearerAuth()
@Controller('access')
class AccessController {
  constructor(private readonly access: AccessService) {}

  @Roles('manager')
  @Post('locks')
  createLock(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createLockSchema)) body: z.infer<typeof createLockSchema>,
  ) {
    return this.access.createLock(orgId, body);
  }

  @Get('locks')
  listLocks(@CurrentOrg() orgId: string) {
    return this.access.listLocks(orgId);
  }

  @Roles('manager')
  @Post('credentials')
  issue(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(issueSchema)) body: z.infer<typeof issueSchema>,
  ) {
    return this.access.issueCredential(orgId, {
      bookingId: body.bookingId,
      unitId: body.unitId,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validTo: body.validTo ? new Date(body.validTo) : undefined,
      type: body.type,
    });
  }

  @Roles('manager')
  @Post('credentials/:id/revoke')
  revoke(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.revokeCredential(orgId, id);
  }

  @Get('credentials')
  list(
    @CurrentOrg() orgId: string,
    @Query('bookingId') bookingId?: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.access.listCredentials(orgId, { bookingId, unitId });
  }

  @Get('credentials/:id/events')
  events(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.listEvents(orgId, id);
  }
}

@Module({
  controllers: [AccessController],
  providers: [AccessService, SimulatedLockProvider],
  exports: [AccessService],
})
export class AccessModule {}
