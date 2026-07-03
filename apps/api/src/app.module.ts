import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { PropertyModule } from './modules/property/property.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { ConciergeModule } from './modules/concierge/concierge.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { KbModule } from './modules/kb/kb.module.js';
import { ConsoleModule } from './console/console.module.js';
import { TenantMiddleware } from './common/tenant.middleware.js';
import { DomainErrorFilter } from './common/domain-error.filter.js';

/**
 * The modular monolith root. One Nest module per bounded context under
 * src/modules/*; identity/auth under src/auth. Modules talk to each other
 * through injected services or the event bus — never another context's tables.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AuditModule, // global: exposes AuditService everywhere
    HealthModule,
    PropertyModule,
    KbModule,
    BookingModule,
    CalendarModule,
    ConciergeModule,
    MessagingModule,
    AccessModule,
    TasksModule,
    MaintenanceModule,
    NotificationModule,
    PricingModule,
    WorkflowModule,
    BillingModule,
    ConsoleModule, // dev-only internal console at /console
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
