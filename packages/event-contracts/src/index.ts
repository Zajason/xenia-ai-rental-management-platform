/**
 * THE EVENT CATALOG — the contract that keeps the modular monolith honestly
 * decoupled. Every event on the bus is defined here once: a name + a zod payload.
 * Producers validate before publishing; consumers validate on receipt. If this
 * file and a handler disagree, the contract test fails.
 *
 * Naming: `<aggregate>.<past-tense-fact>`. Events are facts, not commands.
 */
import { z } from 'zod';

const base = z.object({
  eventId: z.string().uuid(),
  orgId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
});

export const EVENTS = {
  'booking.confirmed': base.extend({
    bookingId: z.string().uuid(),
    unitId: z.string().uuid(),
    guestId: z.string().uuid().nullable(),
    checkIn: z.string().datetime(),
    checkOut: z.string().datetime(),
    channel: z.string(),
  }),
  'booking.modified': base.extend({
    bookingId: z.string().uuid(),
    changes: z.record(z.unknown()),
  }),
  'booking.cancelled': base.extend({ bookingId: z.string().uuid() }),
  'booking.conflict_detected': base.extend({
    unitId: z.string().uuid(),
    attempted: z.object({ checkIn: z.string(), checkOut: z.string() }),
    conflictingBlockId: z.string().uuid().optional(),
  }),

  'availability.blocked': base.extend({
    unitId: z.string().uuid(),
    blockId: z.string().uuid(),
  }),

  'task.created': base.extend({
    taskId: z.string().uuid(),
    unitId: z.string().uuid(),
    type: z.string(),
    dueAt: z.string().datetime().nullable(),
  }),
  'task.completed': base.extend({ taskId: z.string().uuid(), unitId: z.string().uuid() }),
  'unit.ready': base.extend({ unitId: z.string().uuid() }),

  'access.granted': base.extend({
    credentialId: z.string().uuid(),
    unitId: z.string().uuid(),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
  }),
  'access.expired': base.extend({ credentialId: z.string().uuid() }),
  'access.revoked': base.extend({ credentialId: z.string().uuid(), reason: z.string() }),

  'message.received': base.extend({
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
    body: z.string(),
    language: z.string().optional(),
  }),
  'human.handoff.requested': base.extend({
    conversationId: z.string().uuid(),
    reason: z.string(),
  }),

  'maintenance.ticket.opened': base.extend({
    ticketId: z.string().uuid(),
    unitId: z.string().uuid(),
    priority: z.number(),
  }),

  'pricing.suggestion.created': base.extend({
    unitId: z.string().uuid(),
    day: z.string(),
    suggestedPrice: z.number(),
  }),

  'agent.action.requested': base.extend({
    sessionId: z.string().uuid(),
    tool: z.string(),
    args: z.record(z.unknown()),
    requiresApproval: z.boolean(),
  }),
} as const;

export type EventName = keyof typeof EVENTS;
export type EventPayload<T extends EventName> = z.infer<(typeof EVENTS)[T]>;

export function parseEvent<T extends EventName>(name: T, data: unknown): EventPayload<T> {
  return EVENTS[name].parse(data) as EventPayload<T>;
}

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];
