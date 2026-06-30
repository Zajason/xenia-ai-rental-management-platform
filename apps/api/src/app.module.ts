import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { TenantMiddleware } from './common/tenant.middleware.js';

/**
 * The modular monolith root. Each bounded context is a Nest module under
 * src/modules/*. Today only Health and Booking are wired with real code; the
 * remaining context folders carry a README describing their responsibility and
 * are filled in per the roadmap (docs/architecture/roadmap.md).
 *
 * Hard rule: modules talk to each other through injected services or the event
 * bus — never by reaching into another context's tables.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    HealthModule,
    BookingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve + set tenant context on every request except health/docs.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
