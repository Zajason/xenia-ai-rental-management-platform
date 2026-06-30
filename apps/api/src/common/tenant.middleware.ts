import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Resolves the tenant for the request and stashes it on `req.orgId`. In the MVP
 * this trusts a header / decoded JWT claim; the real auth module replaces the
 * resolution while keeping this contract. Every DB access then runs inside
 * `withTenant(req.orgId, …)` so RLS scopes the query.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { orgId?: string }, _res: Response, next: NextFunction) {
    const headerOrg = req.header('x-org-id');
    if (headerOrg) req.orgId = headerOrg;
    next();
  }
}
