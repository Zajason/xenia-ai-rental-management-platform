import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContextMissingError } from '@xenia/shared';

/** Injects the resolved tenant id; throws if a route forgot to set it. */
export const CurrentOrg = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ orgId?: string }>();
  if (!req.orgId) throw new TenantContextMissingError();
  return req.orgId;
});
