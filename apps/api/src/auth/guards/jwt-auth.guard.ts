import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators.js';
import { TokenService } from '../token.service.js';

/**
 * Global authentication guard. Verifies the Bearer access token, attaches the
 * principal to `req.user`, and sets `req.orgId` (consumed by @CurrentOrg so every
 * DB call runs inside the right tenant). Routes marked @Public() skip this.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown; orgId?: string }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.tokens.verifyAccess(header.slice(7));
    req.user = { userId: payload.sub, orgId: payload.org, role: payload.role, scope: payload.scope };
    req.orgId = payload.org;
    return true;
  }
}
