import {
  Body,
  Controller,
  Get,
  Injectable,
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
import { desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { Roles } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const workflowSchema = z.object({
  name: z.string().min(1).max(200),
  triggerEvent: z.string().min(1).max(96),
  definition: z.object({
    steps: z
      .array(z.object({ key: z.string().min(1), action: z.string().min(1) }))
      .min(1)
      .max(20),
  }),
});
const patchSchema = z.object({ enabled: z.boolean() });

/**
 * Thin API surface over the workflow engine that RUNS in services/workers.
 * Definitions are declarative data; runs/steps are written by the engine and
 * inspected (and retried) here.
 */
@Injectable()
export class WorkflowService {
  create(orgId: string, input: z.infer<typeof workflowSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.workflows)
        .values({ orgId, name: input.name, triggerEvent: input.triggerEvent, definition: input.definition })
        .returning();
      return row;
    });
  }

  list(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.workflows));
  }

  setEnabled(orgId: string, workflowId: string, enabled: boolean) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .update(schema.workflows)
        .set({ enabled })
        .where(eq(schema.workflows.id, workflowId))
        .returning();
      if (!row) throw new NotFoundException('Workflow not found');
      return row;
    });
  }

  listRuns(orgId: string, workflowId?: string) {
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.workflowRuns)
        .where(workflowId ? eq(schema.workflowRuns.workflowId, workflowId) : undefined)
        .orderBy(desc(schema.workflowRuns.createdAt))
        .limit(100),
    );
  }

  listSteps(orgId: string, runId: string) {
    return withTenant(orgId, (tx) =>
      tx.select().from(schema.runSteps).where(eq(schema.runSteps.runId, runId)),
    );
  }
}

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Roles('manager')
  @Post()
  create(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(workflowSchema)) body: z.infer<typeof workflowSchema>,
  ) {
    return this.workflows.create(orgId, body);
  }

  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.workflows.list(orgId);
  }

  @Roles('manager')
  @Patch(':id')
  setEnabled(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(patchSchema)) body: z.infer<typeof patchSchema>,
  ) {
    return this.workflows.setEnabled(orgId, id, body.enabled);
  }

  @Get('runs')
  listRuns(@CurrentOrg() orgId: string, @Query('workflowId') workflowId?: string) {
    return this.workflows.listRuns(orgId, workflowId);
  }

  @Get('runs/:id/steps')
  listSteps(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) runId: string) {
    return this.workflows.listSteps(orgId, runId);
  }
}

@Module({ controllers: [WorkflowController], providers: [WorkflowService], exports: [WorkflowService] })
export class WorkflowModule {}
