import {
  Body,
  Controller,
  ForbiddenException,
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
import { asc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { ConciergeModule, ConciergeService } from '../concierge/concierge.module.js';

const createConversationSchema = z.object({
  unitId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  guestId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'sms', 'email', 'in_app']).optional(),
});
const messageSchema = z.object({ body: z.string().min(1).max(4000) });

@Injectable()
export class MessagingService {
  constructor(private readonly concierge: ConciergeService) {}

  createConversation(orgId: string, input: z.infer<typeof createConversationSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.conversations)
        .values({
          orgId,
          unitId: input.unitId,
          bookingId: input.bookingId,
          guestId: input.guestId,
          channel: input.channel ?? 'in_app',
          status: 'open',
        })
        .returning();
      return row;
    });
  }

  listConversations(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.conversations));
  }

  listMessages(orgId: string, conversationId: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(asc(schema.messages.sentAt)),
    );
  }

  /**
   * Post a message as the current principal. Guests (magic scope) may only post
   * into their own conversation; an inbound guest message auto-triggers the AI
   * concierge (which degrades to human handoff if the AI is unavailable).
   */
  async postMessage(orgId: string, conversationId: string, user: AuthUser, body: string) {
    const conversation = await withTenant(orgId, async (tx) => {
      const [conv] = await tx
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId));
      if (!conv) throw new NotFoundException('Conversation not found');
      return conv;
    });

    const isGuest = user.scope === 'magic' && user.role === 'guest';
    if (isGuest && conversation.guestId !== user.userId) {
      throw new ForbiddenException('Not your conversation');
    }

    const message = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.messages)
        .values({
          orgId,
          conversationId,
          direction: isGuest ? 'inbound' : 'outbound',
          senderType: isGuest ? 'guest' : 'host',
          body,
        })
        .returning();
      if (isGuest) {
        await tx.insert(schema.outbox).values({
          orgId,
          aggregate: 'message',
          eventType: 'message.received',
          payload: { conversationId, messageId: row!.id, body },
        });
      }
      return row;
    });

    // Guest message → the concierge answers (or escalates to a human).
    const ai = isGuest ? await this.concierge.respond(orgId, conversationId) : undefined;
    return { message, ai };
  }
}

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('conversations')
class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Roles('manager')
  @Post()
  createConversation(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createConversationSchema)) body: z.infer<typeof createConversationSchema>,
  ) {
    return this.messaging.createConversation(orgId, body);
  }

  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.messaging.listConversations(orgId);
  }

  @Get(':id/messages')
  listMessages(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messaging.listMessages(orgId, id);
  }

  /** Open to any authenticated principal — including magic-link guests. */
  @Post(':id/messages')
  postMessage(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>,
  ) {
    return this.messaging.postMessage(orgId, id, user, body.body);
  }
}

@Module({
  imports: [ConciergeModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
