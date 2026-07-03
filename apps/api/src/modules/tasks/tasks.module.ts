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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, desc, eq, schema, withTenant } from '@xenia/db';
import { CurrentOrg } from '../../common/current-org.decorator.js';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import type { AuthUser } from '../../auth/decorators.js';
import { ZodValidationPipe } from '../../auth/zod-validation.pipe.js';

const createStaffSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(32).optional(),
  role: z.string().max(32).optional(),
  userId: z.string().uuid().optional(),
});
const createTaskSchema = z.object({
  unitId: z.string().uuid(),
  type: z.enum(['cleaning', 'inspection', 'restock', 'custom']).optional(),
  bookingId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(10).optional(),
});
const assignSchema = z.object({ staffId: z.string().uuid() });
const completeSchema = z.object({ photos: z.array(z.string().url()).max(20).optional() });

@Injectable()
export class TasksService {
  createStaff(orgId: string, input: z.infer<typeof createStaffSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.staff)
        .values({ orgId, name: input.name, phone: input.phone, role: input.role ?? 'cleaner', userId: input.userId })
        .returning();
      return row;
    });
  }

  listStaff(orgId: string) {
    return withTenant(orgId, (tx) => tx.select().from(schema.staff));
  }

  createTask(orgId: string, input: z.infer<typeof createTaskSchema>) {
    return withTenant(orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.tasks)
        .values({
          orgId,
          unitId: input.unitId,
          type: input.type ?? 'cleaning',
          bookingId: input.bookingId,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          priority: input.priority ?? 0,
          status: 'pending',
        })
        .returning();
      await tx.insert(schema.outbox).values({
        orgId,
        aggregate: 'task',
        eventType: 'task.created',
        payload: { taskId: row!.id, unitId: input.unitId, type: row!.type, dueAt: row!.dueAt?.toISOString() ?? null },
      });
      return row;
    });
  }

  listTasks(orgId: string, filters: { unitId?: string; status?: string }) {
    const conds = [
      filters.unitId ? eq(schema.tasks.unitId, filters.unitId) : undefined,
      filters.status ? eq(schema.tasks.status, filters.status as never) : undefined,
    ].filter((c): c is NonNullable<typeof c> => Boolean(c));
    return withTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.tasks)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(schema.tasks.createdAt)),
    );
  }

  assign(orgId: string, taskId: string, staffId: string) {
    return withTenant(orgId, async (tx) => {
      const [task] = await tx.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
      if (!task) throw new NotFoundException('Task not found');
      const [member] = await tx.select().from(schema.staff).where(eq(schema.staff.id, staffId));
      if (!member) throw new NotFoundException('Staff not found');

      const [assignment] = await tx
        .insert(schema.taskAssignments)
        .values({ orgId, taskId, staffId, state: 'offered' })
        .returning();
      await tx.update(schema.tasks).set({ status: 'assigned' }).where(eq(schema.tasks.id, taskId));
      return assignment;
    });
  }

  /** Cleaner accepts a task offered to THEM (matched via staff.userId). */
  async accept(orgId: string, taskId: string, user: AuthUser) {
    return withTenant(orgId, async (tx) => {
      const [me] = await tx.select().from(schema.staff).where(eq(schema.staff.userId, user.userId));
      if (!me) throw new ForbiddenException('No staff profile for this user');
      const [assignment] = await tx
        .select()
        .from(schema.taskAssignments)
        .where(and(eq(schema.taskAssignments.taskId, taskId), eq(schema.taskAssignments.staffId, me.id)));
      if (!assignment) throw new ForbiddenException('Task is not assigned to you');

      await tx
        .update(schema.taskAssignments)
        .set({ state: 'accepted', acceptedAt: new Date() })
        .where(eq(schema.taskAssignments.id, assignment.id));
      const [task] = await tx
        .update(schema.tasks)
        .set({ status: 'accepted' })
        .where(eq(schema.tasks.id, taskId))
        .returning();
      return task;
    });
  }

  /**
   * Completing a turnover task flips the unit to `ready` and announces it —
   * the signal the access/booking flow downstream waits on.
   */
  async complete(orgId: string, taskId: string, user: AuthUser, photos: string[] = []) {
    return withTenant(orgId, async (tx) => {
      const [task] = await tx.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
      if (!task) throw new NotFoundException('Task not found');

      // Cleaners may only complete tasks assigned to them; managers+ may always.
      if (user.role === 'cleaner') {
        const [me] = await tx.select().from(schema.staff).where(eq(schema.staff.userId, user.userId));
        const [assignment] = me
          ? await tx
              .select()
              .from(schema.taskAssignments)
              .where(and(eq(schema.taskAssignments.taskId, taskId), eq(schema.taskAssignments.staffId, me.id)))
          : [];
        if (!assignment) throw new ForbiddenException('Task is not assigned to you');
        await tx
          .update(schema.taskAssignments)
          .set({ state: 'completed', completedAt: new Date() })
          .where(eq(schema.taskAssignments.id, assignment.id));
      }

      for (const url of photos) {
        await tx.insert(schema.taskPhotos).values({ orgId, taskId, url, kind: 'after' });
      }

      const [updated] = await tx
        .update(schema.tasks)
        .set({ status: 'completed' })
        .where(eq(schema.tasks.id, taskId))
        .returning();
      await tx.update(schema.units).set({ status: 'ready' }).where(eq(schema.units.id, task.unitId));

      await tx.insert(schema.outbox).values([
        { orgId, aggregate: 'task', eventType: 'task.completed', payload: { taskId, unitId: task.unitId } },
        { orgId, aggregate: 'unit', eventType: 'unit.ready', payload: { unitId: task.unitId } },
      ]);
      return updated;
    });
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Roles('manager')
  @Post('staff')
  createStaff(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createStaffSchema)) body: z.infer<typeof createStaffSchema>,
  ) {
    return this.tasks.createStaff(orgId, body);
  }

  @Get('staff')
  listStaff(@CurrentOrg() orgId: string) {
    return this.tasks.listStaff(orgId);
  }

  @Roles('manager')
  @Post('tasks')
  createTask(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    return this.tasks.createTask(orgId, body);
  }

  @Get('tasks')
  listTasks(
    @CurrentOrg() orgId: string,
    @Query('unitId') unitId?: string,
    @Query('status') status?: string,
  ) {
    return this.tasks.listTasks(orgId, { unitId, status });
  }

  @Roles('manager')
  @Post('tasks/:id/assign')
  assign(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(assignSchema)) body: z.infer<typeof assignSchema>,
  ) {
    return this.tasks.assign(orgId, taskId, body.staffId);
  }

  @Roles('cleaner')
  @Post('tasks/:id/accept')
  accept(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.accept(orgId, taskId, user);
  }

  @Roles('cleaner', 'manager')
  @Post('tasks/:id/complete')
  complete(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(completeSchema)) body: z.infer<typeof completeSchema>,
  ) {
    return this.tasks.complete(orgId, taskId, user, body.photos);
  }
}

@Module({ controllers: [TasksController], providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
