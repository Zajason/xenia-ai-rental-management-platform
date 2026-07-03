import { Controller, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';

interface AiResponse {
  reply: string;
  language: string;
  confidence: number;
  escalate: boolean;
  tool_calls: unknown[];
}

/**
 * Gateway between the domain and the Python AI service. Design guarantee: the
 * AI being down NEVER breaks guest messaging — any failure degrades to a human
 * handoff (conversation flagged, host notified via the outbox event, guest told
 * a human will reply). The AI service itself has no DB write path here.
 */
@Injectable()
export class ConciergeService {
  private readonly logger = new Logger(ConciergeService.name);

  private aiUrl() {
    return process.env.AI_CONCIERGE_URL ?? 'http://localhost:8000';
  }

  async respond(orgId: string, conversationId: string) {
    const ctx = await withTenant(orgId, async (tx) => {
      const [conv] = await tx
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId));
      if (!conv) throw new NotFoundException('Conversation not found');
      const [lastInbound] = await tx
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.sentAt))
        .limit(1);
      const [guest] = conv.guestId
        ? await tx.select().from(schema.guests).where(eq(schema.guests.id, conv.guestId))
        : [];
      return { conv, lastInbound, guest };
    });

    if (!ctx.lastInbound) throw new NotFoundException('No message to respond to');

    try {
      const res = await fetch(`${this.aiUrl()}/agent/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          unit_id: ctx.conv.unitId,
          booking_id: ctx.conv.bookingId,
          guest_id: ctx.conv.guestId,
          message: ctx.lastInbound.body,
          language: ctx.guest?.preferredLanguage,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`AI service ${res.status}`);
      const ai = (await res.json()) as AiResponse;

      await withTenant(orgId, (tx) =>
        tx.insert(schema.messages).values({
          orgId,
          conversationId,
          direction: 'outbound',
          senderType: 'ai',
          body: ai.reply,
          metadata: { confidence: ai.confidence, language: ai.language, toolCalls: ai.tool_calls },
        }),
      );
      if (ai.escalate) await this.handoff(orgId, conversationId, 'ai_requested_escalation');
      return { escalated: ai.escalate, reply: ai.reply, language: ai.language, confidence: ai.confidence };
    } catch (err) {
      this.logger.warn(`AI concierge unavailable → human handoff (${String(err)})`);
      await this.handoff(orgId, conversationId, 'ai_unavailable');
      return { escalated: true as const, reply: null };
    }
  }

  private async handoff(orgId: string, conversationId: string, reason: string) {
    await withTenant(orgId, async (tx) => {
      await tx
        .update(schema.conversations)
        .set({ status: 'handoff' })
        .where(eq(schema.conversations.id, conversationId));
      await tx.insert(schema.messages).values({
        orgId,
        conversationId,
        direction: 'outbound',
        senderType: 'system',
        body: 'Your message has been passed to your host — they will reply shortly.',
      });
      await tx.insert(schema.outbox).values({
        orgId,
        aggregate: 'conversation',
        eventType: 'human.handoff.requested',
        payload: { conversationId, reason },
      });
    });
  }
}

@ApiTags('concierge')
@ApiBearerAuth()
@Controller('concierge')
class ConciergeController {
  constructor(private readonly concierge: ConciergeService) {}

  /** Manually (re-)trigger an AI reply for a conversation. */
  @Roles('manager')
  @Post('conversations/:id/respond')
  respond(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) conversationId: string) {
    return this.concierge.respond(orgId, conversationId);
  }
}

@Module({ controllers: [ConciergeController], providers: [ConciergeService], exports: [ConciergeService] })
export class ConciergeModule {}
