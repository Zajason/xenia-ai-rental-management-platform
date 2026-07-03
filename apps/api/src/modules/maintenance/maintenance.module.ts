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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { AccessModule, AccessService } from '../access/access.module.js';

const vendorSchema = z.object({
  name: z.string().min(1).max(200),
  trade: z.string().max(48).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
});
const ticketSchema = z.object({
  unitId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.number().int().min(0).max(10).optional(),
});
const assignVendorSchema = z.object({
  vendorId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  /** Also issue a time-boxed access credential for the visit. */
  grantAccess: z.boolean().optional(),
});
const resolveSchema = z.object({ cost: z.number().nonnegative().optional() });

@Injectable()
export class MaintenanceService {
  constructor(private readonly access: AccessService) {}

  createVendor(orgId: string, input: z.infer<typeof vendorSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx.insert(schema.vendors).values({ orgId, ...input }).returning();
      return row;
    });
  }

  listVendors(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.vendors));
  }

  openTicket(orgId: string, input: z.infer<typeof ticketSchema>, reportedByType = 'staff') {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.maintenanceTickets)
        .values({
          orgId,
          unitId: input.unitId,
          title: input.title,
          description: input.description,
          priority: input.priority ?? 0,
          reportedByType,
          status: 'open',
        })
        .returning();
      await tx.insert(schema.ticketEvents).values({ orgId, ticketId: row!.id, event: 'opened' });
      await tx.insert(schema.outbox).values({
        orgId,
        aggregate: 'maintenance',
        eventType: 'maintenance.ticket.opened',
        payload: { ticketId: row!.id, unitId: input.unitId, priority: row!.priority },
      });
      return row;
    });
  }

  listTickets(orgId: string) {
    return withTenant(orgId, (tx) =>
      tx.select().from(schema.maintenanceTickets).orderBy(desc(schema.maintenanceTickets.openedAt)),
    );
  }

  async assignVendor(orgId: string, ticketId: string, input: z.infer<typeof assignVendorSchema>) {
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

    // Vendor visits can carry a temporary access credential (default 4h window).
    let accessCredentialId: string | null = null;
    if (input.grantAccess && scheduledAt) {
      const [ticket] = await withTenant(orgId, (tx) =>
        tx.select().from(schema.maintenanceTickets).where(eq(schema.maintenanceTickets.id, ticketId)),
      );
      if (!ticket) throw new NotFoundException('Ticket not found');
      const { credential } = await this.access.issueCredential(orgId, {
        unitId: ticket.unitId,
        validFrom: scheduledAt,
        validTo: new Date(scheduledAt.getTime() + 4 * 3600_000),
      });
      accessCredentialId = credential!.id;
    }

    return withTenant(orgId, async (tx) => {
      const [ticket] = await tx
        .select()
        .from(schema.maintenanceTickets)
        .where(eq(schema.maintenanceTickets.id, ticketId));
      if (!ticket) throw new NotFoundException('Ticket not found');
      const [vendor] = await tx.select().from(schema.vendors).where(eq(schema.vendors.id, input.vendorId));
      if (!vendor) throw new NotFoundException('Vendor not found');

      const [assignment] = await tx
        .insert(schema.vendorAssignments)
        .values({ orgId, ticketId, vendorId: input.vendorId, state: 'offered', scheduledAt, accessCredentialId })
        .returning();
      await tx
        .update(schema.maintenanceTickets)
        .set({ status: 'assigned' })
        .where(eq(schema.maintenanceTickets.id, ticketId));
      await tx
        .insert(schema.ticketEvents)
        .values({ orgId, ticketId, event: 'vendor_assigned', payload: { vendorId: input.vendorId } });
      return assignment;
    });
  }

  resolve(orgId: string, ticketId: string, cost?: number) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.maintenanceTickets)
        .set({ status: 'resolved', resolvedAt: new Date(), cost: cost !== undefined ? String(cost) : undefined })
        .where(eq(schema.maintenanceTickets.id, ticketId))
        .returning();
      if (!row) throw new NotFoundException('Ticket not found');
      await tx.insert(schema.ticketEvents).values({ orgId, ticketId, event: 'resolved' });
      return row;
    });
  }
}

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller()
class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Roles('manager')
  @Post('vendors')
  createVendor(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(vendorSchema)) body: z.infer<typeof vendorSchema>,
  ) {
    return this.maintenance.createVendor(orgId, body);
  }

  @Get('vendors')
  listVendors(@CurrentOrg() orgId: string) {
    return this.maintenance.listVendors(orgId);
  }

  @Roles('manager', 'cleaner')
  @Post('maintenance/tickets')
  openTicket(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(ticketSchema)) body: z.infer<typeof ticketSchema>,
  ) {
    return this.maintenance.openTicket(orgId, body);
  }

  @Get('maintenance/tickets')
  listTickets(@CurrentOrg() orgId: string) {
    return this.maintenance.listTickets(orgId);
  }

  @Roles('manager')
  @Post('maintenance/tickets/:id/assign')
  assignVendor(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body(new ZodValidationPipe(assignVendorSchema)) body: z.infer<typeof assignVendorSchema>,
  ) {
    return this.maintenance.assignVendor(orgId, ticketId, body);
  }

  @Roles('manager')
  @Post('maintenance/tickets/:id/resolve')
  resolve(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body(new ZodValidationPipe(resolveSchema)) body: z.infer<typeof resolveSchema>,
  ) {
    return this.maintenance.resolve(orgId, ticketId, body.cost);
  }
}

@Module({
  imports: [AccessModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
