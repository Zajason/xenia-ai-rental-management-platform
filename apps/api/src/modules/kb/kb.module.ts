import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, desc, eq, schema, sql, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const createDocSchema = z.object({
  unitId: z.string().uuid().optional(), // omit for property/org-shared knowledge
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(20000),
  sourceType: z.enum(['manual', 'local_guide', 'faq']).optional(),
  language: z.string().max(8).optional(),
});
const updateDocSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).max(20000).optional(),
});

/**
 * The knowledge-base module: the owner's free-text documents + the trigger that
 * (re)builds the AI's searchable index. The actual chunk→embed→store work lives
 * in the Python service (services/ai-concierge/app/rag/ingest.py); this module
 * owns the source documents and asks the AI service to reindex when they change.
 *
 * Reindex is best-effort: if the AI service is down, editing knowledge still
 * succeeds — the index just goes stale until the next reindex.
 */
@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);

  private aiUrl() {
    return process.env.AI_CONCIERGE_URL ?? 'http://localhost:8000';
  }

  async reindexUnit(orgId: string, unitId: string): Promise<{ ok: boolean; chunks?: number; reason?: string }> {
    try {
      const res = await fetch(`${this.aiUrl()}/kb/reindex`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ org_id: orgId, unit_id: unitId }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`AI service ${res.status}`);
      const body = (await res.json()) as { chunks: number };
      return { ok: true, chunks: body.chunks };
    } catch (err) {
      this.logger.warn(`KB reindex failed for unit ${unitId} (AI service unreachable?): ${String(err)}`);
      return { ok: false, reason: String(err) };
    }
  }

  async reindexOrg(orgId: string) {
    try {
      const res = await fetch(`${this.aiUrl()}/kb/reindex-org`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`AI service ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`KB org reindex failed: ${String(err)}`);
      return { ok: false, reason: String(err) };
    }
  }

  /** Fire-and-forget reindex (used after edits so the request stays snappy). */
  reindexUnitAsync(orgId: string, unitId: string) {
    void this.reindexUnit(orgId, unitId).catch(() => undefined);
  }

  async createDocument(orgId: string, input: z.infer<typeof createDocSchema>) {
    const doc = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.kbDocuments)
        .values({
          orgId,
          unitId: input.unitId,
          title: input.title,
          content: input.content,
          sourceType: input.sourceType ?? 'manual',
          language: input.language ?? 'en',
        })
        .returning();
      return row;
    });
    if (input.unitId) this.reindexUnitAsync(orgId, input.unitId);
    return doc;
  }

  listDocuments(orgId: string, unitId?: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.kbDocuments)
        .where(unitId ? eq(schema.kbDocuments.unitId, unitId) : undefined)
        .orderBy(desc(schema.kbDocuments.createdAt)),
    );
  }

  async updateDocument(orgId: string, id: string, input: z.infer<typeof updateDocSchema>) {
    const doc = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.kbDocuments)
        .set({ ...input, version: sql`${schema.kbDocuments.version} + 1` })
        .where(eq(schema.kbDocuments.id, id))
        .returning();
      if (!row) throw new NotFoundException('Document not found');
      return row;
    });
    if (doc.unitId) this.reindexUnitAsync(orgId, doc.unitId);
    return doc;
  }

  async deleteDocument(orgId: string, id: string) {
    const doc = await withTenant(orgId, async (tx) => {
      const [row] = await tx
        .delete(schema.kbDocuments)
        .where(eq(schema.kbDocuments.id, id))
        .returning();
      if (!row) throw new NotFoundException('Document not found');
      return row;
    });
    if (doc.unitId) this.reindexUnitAsync(orgId, doc.unitId);
    return { ok: true };
  }

  /** Debug helper: how many searchable chunks exist for a unit right now. */
  chunkStats(orgId: string, unitId: string) {
    return withTenant(orgId, async (tx) => {
      const rows = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.kbChunks)
        .where(and(eq(schema.kbChunks.unitId, unitId)));
      return { unitId, chunks: rows[0]?.n ?? 0 };
    });
  }
}

@ApiTags('knowledge-base')
@ApiBearerAuth()
@Controller('kb')
class KbController {
  constructor(private readonly kb: KbService) {}

  @Roles('manager')
  @Post('documents')
  create(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createDocSchema)) body: z.infer<typeof createDocSchema>,
  ) {
    return this.kb.createDocument(orgId, body);
  }

  @Get('documents')
  list(@CurrentOrg() orgId: string, @Query('unitId') unitId?: string) {
    return this.kb.listDocuments(orgId, unitId);
  }

  @Roles('manager')
  @Patch('documents/:id')
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDocSchema)) body: z.infer<typeof updateDocSchema>,
  ) {
    return this.kb.updateDocument(orgId, id, body);
  }

  @Roles('manager')
  @Delete('documents/:id')
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.kb.deleteDocument(orgId, id);
  }

  /** Explicitly rebuild the index for a unit (awaited — returns the chunk count). */
  @Roles('manager')
  @Post('units/:unitId/reindex')
  reindexUnit(@CurrentOrg() orgId: string, @Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.kb.reindexUnit(orgId, unitId);
  }

  /** Rebuild the whole org's index (units + shared docs). Good after seeding. */
  @Roles('manager')
  @Post('reindex')
  reindexOrg(@CurrentOrg() orgId: string) {
    return this.kb.reindexOrg(orgId);
  }

  @Get('units/:unitId/chunks')
  stats(@CurrentOrg() orgId: string, @Param('unitId', ParseUUIDPipe) unitId: string) {
    return this.kb.chunkStats(orgId, unitId);
  }
}

@Module({ controllers: [KbController], providers: [KbService], exports: [KbService] })
export class KbModule {}
