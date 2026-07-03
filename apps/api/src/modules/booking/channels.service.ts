import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, eq, schema, withTenant } from '@xenia/db';
import { BookingConflictError } from '@xenia/shared';
import { BookingService } from './booking.service.js';
import { AuditService } from '../audit/audit.module.js';

export interface ChannelWebhookEvent {
  eventId: string;
  type: 'booking.created' | 'booking.cancelled';
  externalRef: string;
  unitId?: string;
  checkIn?: string;
  checkOut?: string;
  guest?: { name: string; email: string; language?: string };
}

/**
 * The channel-manager ingestion path. Real Airbnb/Booking.com integrations and
 * the dummy providers used in tests/demos all hit the same webhook endpoint with
 * the same envelope — swapping a dummy for a real adapter is a mapping layer,
 * not a rewrite (see docs/integrations/channels.md).
 *
 * Guarantees exercised here:
 *  - idempotency: duplicate deliveries (same provider event id) are no-ops
 *  - exclusivity: an overlapping booking from another channel is rejected by the
 *    DB exclusion constraint and recorded as a conflict — never double-booked
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly bookings: BookingService,
    private readonly audit: AuditService,
  ) {}

  createChannel(orgId: string, input: { type: 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'ical'; name: string }) {
    const webhookSecret = randomBytes(24).toString('base64url');
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.channels)
        .values({ orgId, type: input.type, name: input.name, webhookSecret })
        .returning();
      return row;
    });
  }

  listChannels(orgId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select({ id: schema.channels.id, type: schema.channels.type, name: schema.channels.name })
        .from(schema.channels),
    );
  }

  async ingestWebhook(orgId: string, channelId: string, secret: string | undefined, event: ChannelWebhookEvent) {
    // 1. Authenticate the caller against the channel's shared secret.
    const [channel] = await withTenant(orgId, (tx) =>
      tx.select().from(schema.channels).where(eq(schema.channels.id, channelId)),
    );
    if (!channel) throw new NotFoundException('Unknown channel');
    if (!secret || secret !== channel.webhookSecret) {
      throw new UnauthorizedException('Invalid channel webhook secret');
    }

    // 2. Idempotency: persist the raw event keyed on the provider's event id.
    //    A duplicate delivery hits the unique constraint and becomes a no-op.
    const inserted = await withTenant(orgId, (tx) =>
      tx
        .insert(schema.webhookEvents)
        .values({
          orgId,
          provider: `${channel.type}:${channelId}`,
          externalEventId: event.eventId,
          payload: event as unknown as Record<string, unknown>,
          status: 'received',
        })
        .onConflictDoNothing()
        .returning(),
    );
    if (inserted.length === 0) return { status: 'duplicate' as const };
    const webhookRowId = inserted[0]!.id;

    // 3. Process.
    try {
      if (event.type === 'booking.created') {
        const result = await this.processCreated(orgId, channelId, event);
        await this.markWebhook(orgId, webhookRowId, 'processed');
        return { status: 'processed' as const, bookingId: result.bookingId };
      }
      const result = await this.processCancelled(orgId, channelId, event);
      await this.markWebhook(orgId, webhookRowId, 'processed');
      return { status: 'processed' as const, bookingId: result.bookingId };
    } catch (err) {
      if (err instanceof BookingConflictError) {
        // The cardinal case: another channel already holds these dates.
        await this.markWebhook(orgId, webhookRowId, 'conflict');
        await withTenant(orgId, (tx) =>
          tx.insert(schema.outbox).values({
            orgId,
            aggregate: 'booking',
            eventType: 'booking.conflict_detected',
            payload: {
              unitId: event.unitId,
              attempted: { checkIn: event.checkIn, checkOut: event.checkOut },
            },
          }),
        );
        await this.audit.record(orgId, {
          actorType: 'webhook',
          action: 'booking.conflict_detected',
          resourceType: 'unit',
          resourceId: event.unitId,
          after: { channelId, externalRef: event.externalRef },
        });
        return { status: 'conflict' as const };
      }
      await this.markWebhook(orgId, webhookRowId, 'failed');
      throw err;
    }
  }

  private async processCreated(orgId: string, channelId: string, event: ChannelWebhookEvent) {
    if (!event.unitId || !event.checkIn || !event.checkOut) {
      throw new NotFoundException('booking.created requires unitId, checkIn, checkOut');
    }

    // Upsert the guest by email so returning guests keep one identity.
    let guestId: string | undefined;
    if (event.guest) {
      guestId = await withTenant(orgId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(schema.guests)
          .where(eq(schema.guests.email, event.guest!.email));
        if (existing) return existing.id;
        const [created] = await tx
          .insert(schema.guests)
          .values({
            orgId,
            name: event.guest!.name,
            email: event.guest!.email,
            preferredLanguage: event.guest!.language ?? 'en',
          })
          .returning();
        return created!.id;
      });
    }

    const booking = await this.bookings.confirm(orgId, {
      unitId: event.unitId,
      guestId,
      channelId,
      checkIn: new Date(event.checkIn),
      checkOut: new Date(event.checkOut),
      externalRef: event.externalRef,
    });

    await withTenant(orgId, (tx) =>
      tx.insert(schema.bookingExternalRefs).values({
        orgId,
        bookingId: booking!.id,
        channelId,
        externalId: event.externalRef,
      }),
    );

    return { bookingId: booking!.id };
  }

  private async processCancelled(orgId: string, channelId: string, event: ChannelWebhookEvent) {
    const [ref] = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.bookingExternalRefs)
        .where(
          and(
            eq(schema.bookingExternalRefs.channelId, channelId),
            eq(schema.bookingExternalRefs.externalId, event.externalRef),
          ),
        ),
    );
    if (!ref) throw new NotFoundException('No booking for that external reference');
    const booking = await this.bookings.cancel(orgId, ref.bookingId);
    return { bookingId: booking.id };
  }

  private markWebhook(orgId: string, id: string, status: string) {
    return withTenant(orgId, (tx) =>
      tx
        .update(schema.webhookEvents)
        .set({ status, processedAt: new Date() })
        .where(eq(schema.webhookEvents.id, id)),
    );
  }
}
