import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const notifySchema = z.object({
  recipientRef: z.string().min(1).max(191),
  template: z.string().min(1).max(96),
  payload: z.record(z.unknown()).optional(),
  channels: z.array(z.enum(['email', 'sms', 'whatsapp', 'push'])).min(1),
  dedupeKey: z.string().max(191).optional(),
});

/**
 * The provider port. The simulator "delivers" instantly; real adapters (SMTP,
 * Twilio SMS/WhatsApp, push) implement the same send() and are selected by env.
 */
export interface NotificationChannelProvider {
  send(channel: string, recipientRef: string, template: string, payload: Record<string, unknown>): Promise<{ ref: string }>;
}

@Injectable()
export class SimulatedNotificationProvider implements NotificationChannelProvider {
  async send(
    _channel: string,
    _recipientRef: string,
    _template: string,
    _payload: Record<string, unknown>,
  ): Promise<{ ref: string }> {
    return { ref: `sim_ntf_${randomBytes(6).toString('hex')}` };
  }
}

/**
 * The single fan-out point for messages to humans. Other modules call
 * notify() — never a provider SDK directly. Idempotent on
 * (recipientRef, template, dedupeKey).
 */
@Injectable()
export class NotificationService {
  constructor(private readonly provider: SimulatedNotificationProvider) {}

  async notify(orgId: string, input: z.infer<typeof notifySchema>) {
    if (input.dedupeKey) {
      const [existing] = await withTenant(orgId, (tx) =>
        tx
          .select()
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.recipientRef, input.recipientRef),
              eq(schema.notifications.template, input.template),
              eq(schema.notifications.dedupeKey, input.dedupeKey!),
            ),
          ),
      );
      if (existing) return { deduped: true as const, notificationId: existing.id };
    }

    const notification = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.notifications)
        .values({
          orgId,
          recipientRef: input.recipientRef,
          template: input.template,
          payload: input.payload ?? {},
          dedupeKey: input.dedupeKey,
          status: 'sent',
        })
        .returning();
      return row;
    });

    for (const channel of input.channels) {
      const { ref } = await this.provider.send(channel, input.recipientRef, input.template, input.payload ?? {});
      await withTenant(orgId, (tx) =>
        tx.insert(schema.deliveryLog).values({
          orgId,
          notificationId: notification!.id,
          channel,
          status: 'delivered',
          providerRef: ref,
        }),
      );
    }
    return { deduped: false as const, notificationId: notification!.id };
  }

  list(orgId: string) {
    return withTenant(orgId, (tx) =>
      tx.select().from(schema.notifications).orderBy(desc(schema.notifications.createdAt)),
    );
  }

  deliveries(orgId: string, notificationId: string) {
    return withTenant(orgId, (tx) =>
      tx.select().from(schema.deliveryLog).where(eq(schema.deliveryLog.notificationId, notificationId)),
    );
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Roles('manager')
  @Post()
  notify(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(notifySchema)) body: z.infer<typeof notifySchema>,
  ) {
    return this.notifications.notify(orgId, body);
  }

  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.notifications.list(orgId);
  }

  @Get(':id/deliveries')
  deliveries(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.deliveries(orgId, id);
  }
}

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, SimulatedNotificationProvider],
  exports: [NotificationService],
})
export class NotificationModule {}
