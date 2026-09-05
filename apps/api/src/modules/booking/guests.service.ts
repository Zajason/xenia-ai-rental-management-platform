import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, schema, withTenant } from '@xenia/db';

/**
 * Read-only guest directory. Guests themselves are created by the channel
 * ingestion path (see channels.service.ts); this service just lists/reads
 * them — left-joined with guest_profiles so the dashboard can show the
 * returning-guest memory (VIP flag, stay count, learned preferences) that
 * the AI concierge already reads.
 */
@Injectable()
export class GuestsService {
  list(orgId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select({
          id: schema.guests.id,
          name: schema.guests.name,
          email: schema.guests.email,
          phone: schema.guests.phone,
          preferredLanguage: schema.guests.preferredLanguage,
          notes: schema.guests.notes,
          createdAt: schema.guests.createdAt,
          isVip: schema.guestProfiles.isVip,
          stayCount: schema.guestProfiles.stayCount,
        })
        .from(schema.guests)
        .leftJoin(schema.guestProfiles, eq(schema.guestProfiles.guestId, schema.guests.id))
        .orderBy(desc(schema.guests.createdAt)),
    );
  }

  async get(orgId: string, guestId: string) {
    const [row] = await withTenant(orgId, (tx) =>
      tx
        .select({
          id: schema.guests.id,
          name: schema.guests.name,
          email: schema.guests.email,
          phone: schema.guests.phone,
          preferredLanguage: schema.guests.preferredLanguage,
          notes: schema.guests.notes,
          createdAt: schema.guests.createdAt,
          isVip: schema.guestProfiles.isVip,
          stayCount: schema.guestProfiles.stayCount,
          summary: schema.guestProfiles.summary,
          preferences: schema.guestProfiles.preferences,
        })
        .from(schema.guests)
        .leftJoin(schema.guestProfiles, eq(schema.guestProfiles.guestId, schema.guests.id))
        .where(eq(schema.guests.id, guestId)),
    );
    if (!row) throw new NotFoundException('Guest not found');

    const bookings = await withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.guestId, guestId))
        .orderBy(desc(schema.bookings.checkIn)),
    );
    return { ...row, bookings };
  }
}
