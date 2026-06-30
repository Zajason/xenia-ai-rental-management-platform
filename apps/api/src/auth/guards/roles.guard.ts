import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@xenia/shared';
import { ROLES_KEY } from '../decorators.js';
import type { AuthUser } from '../decorators.js';

/**
 * Authorization guard. Runs after JwtAuthGuard. If a route declares @Roles(...),
 * the principal's role must be in that set — except `owner`/`admin`, who are
 * org-level superusers and pass any role check.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === 'owner' || user.role === 'admin') return true;
    if (!required.includes(user.role as Role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
