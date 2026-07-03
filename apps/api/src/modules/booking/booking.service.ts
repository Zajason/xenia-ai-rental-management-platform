import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, schema, withTenant } from '@xenia/db';
import { BookingConflictError } from '@xenia/shared';
import { AuditService } from '../audit/audit.module.js';

interface ConfirmBookingInput {
  unitId: string;
  guestId?: string;
  channelId?: string;
  checkIn: Date;
  checkOut: Date;
  externalRef?: string;
}

/**
 * Demonstrates the platform's cardinal pattern: confirming a booking writes the
 * booking row AND its availability block in one transaction. The availability
 * block is guarded by the Postgres exclusion constraint, so a conflicting set of
 * dates fails atomically — we translate that into a clean 409.
 *
 * In the full build this also writes an `outbox` row (booking.confirmed) in the
 * same transaction so the workflow engine fans out cleaning + access downstream.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.bookings));
  }

  async confirm(orgId: string, input: ConfirmBookingInput) {
    try {
      return await withTenant(orgId, async (tx) => {
        const [booking] = await tx
          .insert(schema.bookings)
          .values({
            orgId,
            unitId: input.unitId,
            guestId: input.guestId,
            channelId: input.channelId,
            status: 'confirmed',
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            externalRef: input.externalRef,
          })
          .returning();

        await tx.insert(schema.availabilityBlocks).values({
          orgId,
          unitId: input.unitId,
          source: 'booking',
          sourceId: booking!.id,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
        });

        await tx.insert(schema.outbox).values({
          orgId,
          aggregate: 'booking',
          eventType: 'booking.confirmed',
          payload: {
            bookingId: booking!.id,
            unitId: input.unitId,
            checkIn: input.checkIn.toISOString(),
            checkOut: input.checkOut.toISOString(),
          },
        });

        return booking;
      }).then(async (booking) => {
        await this.audit.record(orgId, {
          actorType: 'user',
          action: 'booking.confirmed',
          resourceType: 'booking',
          resourceId: booking!.id,
          after: { unitId: input.unitId, checkIn: input.checkIn, checkOut: input.checkOut },
        });
        return booking;
      });
    } catch (err) {
      // 23P01 = exclusion_violation → the unit is already booked for those dates.
      if (isExclusionViolation(err)) {
        this.logger.warn(`Booking conflict on unit ${input.unitId}`);
        throw new BookingConflictError();
      }
      throw err;
    }
  }

  /** Cancel a booking: frees its availability block and emits booking.cancelled. */
  async cancel(orgId: string, bookingId: string) {
    return withTenant(orgId, async (tx) => {
      const [booking] = await tx
        .update(schema.bookings)
        .set({ status: 'cancelled' })
        .where(eq(schema.bookings.id, bookingId))
        .returning();
      if (!booking) throw new NotFoundException('Booking not found');

      await tx
        .delete(schema.availabilityBlocks)
        .where(
          and(
            eq(schema.availabilityBlocks.source, 'booking'),
            eq(schema.availabilityBlocks.sourceId, bookingId),
          ),
        );

      await tx.insert(schema.outbox).values({
        orgId,
        aggregate: 'booking',
        eventType: 'booking.cancelled',
        payload: { bookingId },
      });
      return booking;
    });
  }

  getForUnit(orgId: string, unitId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.bookings)
        .where(and(eq(schema.bookings.orgId, orgId), eq(schema.bookings.unitId, unitId))),
    );
  }
}

function isExclusionViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23P01';
}
