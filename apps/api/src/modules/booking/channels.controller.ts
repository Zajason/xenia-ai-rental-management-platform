import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Public, Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';
import { ChannelsService } from './channels.service.js';

const createChannelSchema = z.object({
  type: z.enum(['airbnb', 'booking', 'vrbo', 'direct', 'ical']),
  name: z.string().min(1).max(120),
});

const webhookSchema = z
  .object({
    eventId: z.string().min(1).max(191),
    type: z.enum(['booking.created', 'booking.cancelled']),
    externalRef: z.string().min(1).max(128),
    unitId: z.string().uuid().optional(),
    checkIn: z.string().datetime().optional(),
    checkOut: z.string().datetime().optional(),
    guest: z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        language: z.string().max(8).optional(),
      })
      .optional(),
  })
  .refine((e) => e.type !== 'booking.created' || (e.unitId && e.checkIn && e.checkOut), {
    message: 'booking.created requires unitId, checkIn and checkOut',
  });

@ApiTags('channels')
@Controller()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @ApiBearerAuth()
  @Roles('manager')
  @Post('channels')
  create(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: z.infer<typeof createChannelSchema>,
  ) {
    // Returns webhookSecret ONCE — the caller configures the provider with it.
    return this.channels.createChannel(orgId, body);
  }

  @ApiBearerAuth()
  @Get('channels')
  list(@CurrentOrg() orgId: string) {
    return this.channels.listChannels(orgId);
  }

  /**
   * The webhook receiver a channel (real or dummy) posts booking events to.
   * Public + authenticated by the per-channel shared secret. Always answers 200
   * for handled outcomes (processed/duplicate/conflict) so providers don't retry
   * forever — conflicts are surfaced internally, not to the channel.
   */
  @Public()
  @Post('webhooks/channels/:orgId/:channelId')
  @HttpCode(200)
  ingest(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Headers('x-channel-secret') secret: string | undefined,
    @Body(new ZodValidationPipe(webhookSchema)) body: z.infer<typeof webhookSchema>,
  ) {
    return this.channels.ingestWebhook(orgId, channelId, secret, body);
  }
}
