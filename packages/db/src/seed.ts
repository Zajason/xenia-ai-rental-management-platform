/**
 * Seeds a demo tenant ("Aegean Stays") with two properties, units, a channel,
 * guests (including a returning guest), bookings + availability blocks, staff,
 * locks, KB documents, a pricing rule, and the canonical
 * `booking.confirmed → cleaning + access` workflow.
 *
 * Runs as the privileged role so it can write across the tenant freely.
 * Run with: pnpm db:seed
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as s from './schema/index';

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgres://xenia:xenia@localhost:5442/xenia';

async function main() {
  const pool = new pg.Pool({ connectionString: adminUrl });
  const db = drizzle(pool, { schema: s });

  console.log('→ seeding demo tenant…');

  const [org] = await db
    .insert(s.organizations)
    .values({ name: 'Aegean Stays', slug: 'aegean-stays', plan: 'pro' })
    .returning();
  const orgId = org!.id;

  const [owner] = await db
    .insert(s.users)
    .values({ email: 'owner@aegeanstays.test', name: 'Eleni Host' })
    .returning();
  await db.insert(s.memberships).values({ orgId, userId: owner!.id, role: 'owner' });

  const [property] = await db
    .insert(s.properties)
    .values({ orgId, name: 'Santorini Cliff House', timezone: 'Europe/Athens' })
    .returning();

  const [unitA, unitB] = await db
    .insert(s.units)
    .values([
      { orgId, propertyId: property!.id, name: 'Caldera Suite', capacity: 2, bedrooms: 1 },
      { orgId, propertyId: property!.id, name: 'Sunset Villa', capacity: 4, bedrooms: 2 },
    ])
    .returning();

  await db.insert(s.propertyFacts).values([
    { orgId, unitId: unitA!.id, category: 'wifi', key: 'ssid', value: 'CalderaSuite-5G' },
    { orgId, unitId: unitA!.id, category: 'wifi', key: 'password', value: 'sunset2024' },
    { orgId, unitId: unitA!.id, category: 'checkin', key: 'time', value: 'from 15:00' },
    { orgId, unitId: unitA!.id, category: 'parking', key: 'info', value: 'Free lot 80m uphill, spot 4.' },
  ]);

  const [channel] = await db
    .insert(s.channels)
    .values({ orgId, type: 'airbnb', name: 'Airbnb' })
    .returning();

  // A returning guest (has a profile) + a new guest.
  const [returning, fresh] = await db
    .insert(s.guests)
    .values([
      { orgId, name: 'Marco Rossi', email: 'marco@example.test', phone: '+393331112222', preferredLanguage: 'it' },
      { orgId, name: 'Sophie Dubois', email: 'sophie@example.test', preferredLanguage: 'fr' },
    ])
    .returning();

  await db.insert(s.guestProfiles).values({
    orgId,
    guestId: returning!.id,
    summary: 'Repeat guest. Prefers early check-in and a quiet unit. Allergic to feather pillows.',
    preferences: { earlyCheckIn: true, allergies: ['feathers'] },
    stayCount: 3,
    isVip: true,
  });

  const checkIn = new Date(Date.now() + 2 * 86400000);
  const checkOut = new Date(Date.now() + 5 * 86400000);

  const [booking] = await db
    .insert(s.bookings)
    .values({
      orgId,
      unitId: unitA!.id,
      channelId: channel!.id,
      guestId: returning!.id,
      status: 'confirmed',
      checkIn,
      checkOut,
      totalAmount: '840.00',
      currency: 'EUR',
      externalRef: 'HMABCDEF',
    })
    .returning();

  // The availability block backing the booking (DB rejects any overlap).
  await db.insert(s.availabilityBlocks).values({
    orgId,
    unitId: unitA!.id,
    source: 'booking',
    sourceId: booking!.id,
    checkIn,
    checkOut,
  });

  await db.insert(s.staff).values({ orgId, name: 'Nikos Cleaner', phone: '+306971234567', role: 'cleaner' });

  await db.insert(s.locks).values({ orgId, unitId: unitA!.id, provider: 'simulator', status: 'online', battery: 92 });

  await db.insert(s.kbDocuments).values({
    orgId,
    unitId: unitA!.id,
    title: 'House Manual — Caldera Suite',
    sourceType: 'manual',
    content:
      'The boiler switch is in the hallway closet, left of the door. Hot water takes ~10 minutes. ' +
      'Air conditioning remote is in the bedside drawer. Quiet hours are 23:00–08:00.',
  });

  await db.insert(s.pricingRules).values({
    orgId,
    unitId: unitA!.id,
    name: 'Last-minute low-occupancy discount',
    conditions: { leadTimeDays: { lt: 3 }, occupancy: { lt: 0.5 } },
    effect: { adjustPct: -15 },
    priority: 10,
  });

  await db.insert(s.workflows).values({
    orgId,
    name: 'On booking confirmed → turnover + access',
    triggerEvent: 'booking.confirmed',
    definition: {
      steps: [
        { key: 'create_cleaning', action: 'tasks.createCleaning' },
        { key: 'issue_access', action: 'access.issueCredential' },
        { key: 'start_prearrival', action: 'messaging.startPreArrivalSequence' },
      ],
    },
  });

  console.log(`✓ seeded org ${orgId} (slug: aegean-stays)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
