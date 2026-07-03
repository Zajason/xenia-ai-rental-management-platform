import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { desc, eq, and, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';

export interface AuditEntry {
  actorType: 'user' | 'ai' | 'system' | 'webhook';
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  after?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Append-only audit trail. Global module: any service records via
 * `audit.record(orgId, {...})` without importing the module explicitly.
 */
@Injectable()
export class AuditService {
  async record(orgId: string, entry: AuditEntry) {
    await withTenant(orgId, (tx) =>
      tx.insert(schema.auditEvents).values({
        orgId,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        after: entry.after,
        correlationId: entry.correlationId,
      }),
    );
  }

  list(orgId: string, filters: { resourceType?: string; action?: string; limit: number }) {
    const conds = [
      filters.resourceType ? eq(schema.auditEvents.resourceType, filters.resourceType) : undefined,
      filters.action ? eq(schema.auditEvents.action, filters.action) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.auditEvents)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(schema.auditEvents.at))
        .limit(filters.limit),
    );
  }
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Owner/admin only — the operational black box recorder. */
  @Roles('owner')
  @Get()
  list(
    @CurrentOrg() orgId: string,
    @Query('resourceType') resourceType?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.list(orgId, {
      resourceType,
      action,
      limit: Math.min(Number(limit ?? 100), 500),
    });
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
