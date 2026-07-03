import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { desc, eq, schema, sql, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { CurrentUser, Public, Roles } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.module.js';
import { SimulatedPaymentProvider } from './payment.provider.js';

const checkoutSchema = z.object({ plan: z.enum(['starter', 'pro', 'scale']) });
const payoutSchema = z.object({
  payeeType: z.enum(['staff', 'vendor']),
  payeeId: z.string().uuid(),
  amount: z.number().positive().max(100000),
  currency: z.string().length(3).optional(),
  taskId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});
const providerWebhookSchema = z.object({
  type: z.enum(['invoice.paid', 'subscription.cancelled']),
  orgId: z.string().uuid(),
});

@Injectable()
export class BillingService {
  constructor(
    private readonly provider: SimulatedPaymentProvider,
    private readonly audit: AuditService,
  ) {}

  getSubscription(orgId: string) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.orgId, orgId));
      return row ?? null;
    });
  }

  /** Simulated checkout: in production this creates a Stripe Checkout session. */
  async checkout(orgId: string, plan: string) {
    const activated = await this.provider.activateSubscription(orgId, plan);
    const subscription = await withTenant(orgId, async (tx) => {
      const unitRows = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.units);
      const count = unitRows[0]?.count ?? 0;
      const [existing] = await tx
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.orgId, orgId));
      const values = {
        plan,
        status: 'active',
        stripeId: activated.ref,
        unitCount: Number(count),
        currentPeriodEnd: activated.periodEnd,
      };
      if (existing) {
        const [row] = await tx
          .update(schema.subscriptions)
          .set(values)
          .where(eq(schema.subscriptions.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await tx
        .insert(schema.subscriptions)
        .values({ orgId, ...values })
        .returning();
      return row;
    });
    await this.audit.record(orgId, {
      actorType: 'user',
      action: 'billing.subscription.activated',
      resourceType: 'subscription',
      resourceId: subscription!.id,
      after: { plan },
    });
    return subscription;
  }

  async cancel(orgId: string) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.subscriptions)
        .set({ status: 'cancelled' })
        .where(eq(schema.subscriptions.orgId, orgId))
        .returning();
      if (!row) throw new NotFoundException('No subscription');
      return row;
    });
  }

  /** Provider webhook (dummy-signed): renew or cancel out-of-band. */
  async handleProviderEvent(signature: string | undefined, event: z.infer<typeof providerWebhookSchema>) {
    const expected = process.env.BILLING_WEBHOOK_SECRET ?? 'dev-billing-secret';
    if (signature !== expected) throw new UnauthorizedException('Bad billing webhook signature');

    if (event.type === 'subscription.cancelled') {
      await this.cancel(event.orgId);
      return { handled: 'subscription.cancelled' };
    }
    await withTenant(event.orgId, (tx) =>
      tx
        .update(schema.subscriptions)
        .set({ status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) })
        .where(eq(schema.subscriptions.orgId, event.orgId)),
    );
    return { handled: 'invoice.paid' };
  }

  /**
   * In-app payout: the owner/manager pays a cleaner or repair vendor through
   * Xenia. Validates the payee exists in this org, then executes via the
   * PaymentProvider (Stripe Connect transfer in production).
   */
  async createPayout(orgId: string, user: AuthUser, input: z.infer<typeof payoutSchema>) {
    const payee = await withTenant(orgId, async (tx) => {
      if (input.payeeType === 'staff') {
        const [row] = await tx.select().from(schema.staff).where(eq(schema.staff.id, input.payeeId));
        return row ?? null;
      }
      const [row] = await tx.select().from(schema.vendors).where(eq(schema.vendors.id, input.payeeId));
      return row ?? null;
    });
    if (!payee) throw new NotFoundException(`No ${input.payeeType} with that id in this organization`);

    const currency = (input.currency ?? 'EUR').toUpperCase();
    const [pending] = await withTenant(orgId, (tx) =>
      tx
        .insert(schema.payouts)
        .values({
          orgId,
          payerUserId: user.userId,
          payeeType: input.payeeType,
          payeeId: input.payeeId,
          amount: input.amount.toFixed(2),
          currency,
          status: 'pending',
          taskId: input.taskId,
          ticketId: input.ticketId,
          note: input.note,
        })
        .returning(),
    );

    try {
      const result = await this.provider.transfer({
        amountCents: Math.round(input.amount * 100),
        currency,
        payeeRef: `${input.payeeType}:${input.payeeId}`,
      });
      const [paid] = await withTenant(orgId, (tx) =>
        tx
          .update(schema.payouts)
          .set({
            status: result.status,
            providerRef: result.ref,
            paidAt: result.status === 'paid' ? new Date() : null,
          })
          .where(eq(schema.payouts.id, pending!.id))
          .returning(),
      );
      await this.audit.record(orgId, {
        actorType: 'user',
        actorId: user.userId,
        action: 'billing.payout.paid',
        resourceType: 'payout',
        resourceId: paid!.id,
        after: { payeeType: input.payeeType, payeeId: input.payeeId, amount: input.amount, currency },
      });
      return paid;
    } catch (err) {
      await withTenant(orgId, (tx) =>
        tx.update(schema.payouts).set({ status: 'failed' }).where(eq(schema.payouts.id, pending!.id)),
      );
      throw err;
    }
  }

  listPayouts(orgId: string) {
    return withTenant(orgId, (tx) =>
      tx.select().from(schema.payouts).orderBy(desc(schema.payouts.createdAt)),
    );
  }
}

@ApiTags('billing')
@Controller()
class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiBearerAuth()
  @Get('billing/subscription')
  getSubscription(@CurrentOrg() orgId: string) {
    return this.billing.getSubscription(orgId);
  }

  @ApiBearerAuth()
  @Roles('owner')
  @Post('billing/subscription/checkout')
  checkout(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ) {
    return this.billing.checkout(orgId, body.plan);
  }

  @ApiBearerAuth()
  @Roles('owner')
  @Post('billing/subscription/cancel')
  @HttpCode(200)
  cancel(@CurrentOrg() orgId: string) {
    return this.billing.cancel(orgId);
  }

  @Public()
  @Post('webhooks/billing')
  @HttpCode(200)
  providerWebhook(
    @Headers('x-billing-signature') signature: string | undefined,
    @Body(new ZodValidationPipe(providerWebhookSchema)) body: z.infer<typeof providerWebhookSchema>,
  ) {
    return this.billing.handleProviderEvent(signature, body);
  }

  @ApiBearerAuth()
  @Roles('manager')
  @Post('billing/payouts')
  createPayout(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(payoutSchema)) body: z.infer<typeof payoutSchema>,
  ) {
    return this.billing.createPayout(orgId, user, body);
  }

  @ApiBearerAuth()
  @Get('billing/payouts')
  listPayouts(@CurrentOrg() orgId: string) {
    return this.billing.listPayouts(orgId);
  }
}

@Module({
  controllers: [BillingController],
  providers: [BillingService, SimulatedPaymentProvider],
  exports: [BillingService],
})
export class BillingModule {}
