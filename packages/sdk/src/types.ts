/**
 * Wire types returned by the API. These mirror the Drizzle row shapes in
 * `@xenia/db` (JSON-serialized: dates as ISO strings, numeric columns as
 * strings) — kept here rather than imported from `@xenia/db` so the SDK stays
 * usable from a browser bundle with zero server-only dependencies.
 */

export type Role = 'owner' | 'admin' | 'manager' | 'cleaner';

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
}

export interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Property {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  timezone: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
}

export type UnitStatus = 'ready' | 'dirty' | 'maintenance' | 'blocked';

export interface Unit {
  id: string;
  orgId: string;
  propertyId: string;
  name: string;
  capacity: number;
  bedrooms: number;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyFact {
  id: string;
  orgId: string;
  unitId: string;
  category: string;
  key: string;
  value: string;
  createdAt: string;
}

export type ChannelType = 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'ical';

export interface Channel {
  id: string;
  orgId: string;
  type: ChannelType;
  name: string;
  createdAt: string;
}

export interface ChannelWithSecret extends Channel {
  webhookSecret: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'modified' | 'cancelled';

export interface Booking {
  id: string;
  orgId: string;
  unitId: string;
  channelId: string | null;
  guestId: string | null;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  totalAmount: string | null;
  currency: string;
  externalRef: string | null;
  createdAt: string;
}

export interface AvailabilityBlock {
  id: string;
  orgId: string;
  unitId: string;
  source: 'booking' | 'hold' | 'manual' | 'maintenance';
  sourceId: string | null;
  checkIn: string;
  checkOut: string;
}

export interface Guest {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLanguage: string;
  notes: string | null;
  createdAt: string;
  isVip: boolean | null;
  stayCount: number | null;
}

export interface GuestDetail extends Guest {
  summary: string | null;
  preferences: Record<string, unknown> | null;
  bookings: Booking[];
}

export interface Staff {
  id: string;
  orgId: string;
  userId: string | null;
  name: string;
  phone: string | null;
  role: string;
  skills: string[];
  createdAt: string;
}

export type TaskType = 'cleaning' | 'inspection' | 'restock' | 'custom';
export type TaskStatus = 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  orgId: string;
  unitId: string;
  bookingId: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  dueAt: string | null;
  createdAt: string;
}

export interface Vendor {
  id: string;
  orgId: string;
  name: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
}

export type TicketStatus = 'open' | 'triaged' | 'assigned' | 'in_progress' | 'resolved' | 'cancelled';

export interface MaintenanceTicket {
  id: string;
  orgId: string;
  unitId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: number;
  cost: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface VendorAssignment {
  id: string;
  ticketId: string;
  vendorId: string;
  state: string;
  scheduledAt: string | null;
  accessCredentialId: string | null;
}

export interface Lock {
  id: string;
  orgId: string;
  unitId: string;
  provider: string;
  status: string;
  battery: number | null;
}

export type CredentialStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'failed';

export interface AccessCredential {
  id: string;
  orgId: string;
  unitId: string;
  lockId: string | null;
  bookingId: string | null;
  type: 'code' | 'nfc' | 'mobile_key';
  validFrom: string;
  validTo: string;
  status: CredentialStatus;
  createdAt: string;
}

export interface AccessEvent {
  id: string;
  credentialId: string;
  event: string;
  actor: string | null;
  at: string;
}

export type ConversationChannel = 'whatsapp' | 'sms' | 'email' | 'in_app';

export interface Conversation {
  id: string;
  orgId: string;
  unitId: string | null;
  bookingId: string | null;
  guestId: string | null;
  channel: ConversationChannel;
  status: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'guest' | 'host' | 'ai' | 'system';
  body: string;
  sentAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConciergeReply {
  escalated: boolean;
  reply: string | null;
  language?: string;
  confidence?: number;
}

export interface PricingRule {
  id: string;
  orgId: string;
  unitId: string | null;
  name: string;
  conditions: Record<string, unknown>;
  effect: { adjustPct?: number; adjustAbs?: number; setMinNights?: number };
  priority: number;
  enabled: boolean;
}

export type SuggestionStatus = 'suggested' | 'accepted' | 'rejected' | 'expired';

export interface PricingSuggestion {
  id: string;
  orgId: string;
  unitId: string;
  day: string;
  currentPrice: string | null;
  suggestedPrice: string;
  rationale: { ruleId: string; reason: string }[] | null;
  status: SuggestionStatus;
  createdAt: string;
}

export interface Subscription {
  id: string;
  orgId: string;
  stripeId: string | null;
  plan: string;
  status: string;
  unitCount: number;
  currentPeriodEnd: string | null;
}

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface Payout {
  id: string;
  orgId: string;
  payerUserId: string | null;
  payeeType: 'staff' | 'vendor';
  payeeId: string;
  amount: string;
  currency: string;
  status: PayoutStatus;
  provider: string;
  providerRef: string | null;
  taskId: string | null;
  ticketId: string | null;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface KbDocument {
  id: string;
  orgId: string;
  unitId: string | null;
  title: string;
  sourceType: 'manual' | 'local_guide' | 'faq';
  language: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  actorType: 'user' | 'ai' | 'system' | 'webhook';
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  after: Record<string, unknown> | null;
  at: string;
}

export interface AuthSession {
  user: UserSummary;
  org: OrgSummary;
  role: Role;
  accessToken: string;
  refreshToken: string;
}

export interface MultiOrgChoice {
  message: string;
  organizations: { slug: string; name: string }[];
}
