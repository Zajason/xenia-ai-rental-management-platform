import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { BookingService } from './booking.service.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';

@ApiTags('bookings')
@Controller('bookings')
class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.bookings.list(orgId);
  }

  @Post('confirm')
  confirm(
    @CurrentOrg() orgId: string,
    @Body()
    body: {
      unitId: string;
      guestId?: string;
      channelId?: string;
      checkIn: string;
      checkOut: string;
      externalRef?: string;
    },
  ) {
    return this.bookings.confirm(orgId, {
      ...body,
      checkIn: new Date(body.checkIn),
      checkOut: new Date(body.checkOut),
    });
  }
}

@Module({
  controllers: [BookingController, ChannelsController],
  providers: [BookingService, ChannelsService],
  exports: [BookingService, ChannelsService],
})
export class BookingModule {}
