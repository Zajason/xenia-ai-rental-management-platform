import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@xenia/shared';

/** The principal attached to a request by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  orgId: string;
  /** Staff role, or a magic-link subject type (guest|vendor|cleaner). */
  role: Role | 'guest' | 'vendor' | 'cleaner' | 'staff';
  /** 'staff' = password session, 'magic' = magic-link session. */
  scope: 'staff' | 'magic';
}

/** Marks a route as not requiring authentication. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the listed roles (owner/admin always pass). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated principal. */
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
