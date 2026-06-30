import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { and, db, eq, isNull, schema } from '@xenia/db';
import type { AuthUser } from './decorators.js';

const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
const MAGIC_TTL = process.env.JWT_MAGIC_TTL ?? '2h';
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

export interface AccessPayload {
  sub: string;
  org: string;
  role: AuthUser['role'];
  scope: AuthUser['scope'];
}

/** Mints/validates access JWTs and manages rotating, hashed refresh tokens. */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  signAccess(payload: AccessPayload, magic = false): Promise<string> {
    // expiresIn accepts an `ms` string ("15m") at runtime; the @types signature
    // is a template-literal type that a plain string doesn't satisfy, so cast.
    return this.jwt.signAsync(payload, { expiresIn: magic ? MAGIC_TTL : ACCESS_TTL } as object);
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      return await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** Issue a new refresh token (returns the raw token; only its hash is stored). */
  async issueRefresh(userId: string, orgId: string, userAgent?: string): Promise<string> {
    const raw = randomBytes(40).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
    await db.insert(schema.refreshTokens).values({
      userId,
      orgId,
      tokenHash: this.sha256(raw),
      expiresAt,
      userAgent,
    });
    return raw;
  }

  /**
   * Rotate a refresh token: validate it is live, revoke it, and issue a fresh
   * one linked via `replacedById`. Reuse of an already-rotated token fails here.
   */
  async rotateRefresh(
    raw: string,
    userAgent?: string,
  ): Promise<{ raw: string; userId: string; orgId: string }> {
    const hash = this.sha256(raw);
    const [row] = await db
      .select()
      .from(schema.refreshTokens)
      .where(and(eq(schema.refreshTokens.tokenHash, hash), isNull(schema.refreshTokens.revokedAt)));

    if (!row || row.expiresAt.getTime() < Date.now() || !row.orgId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const newRaw = randomBytes(40).toString('base64url');
    const [replacement] = await db
      .insert(schema.refreshTokens)
      .values({
        userId: row.userId,
        orgId: row.orgId,
        tokenHash: this.sha256(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
        userAgent,
      })
      .returning();

    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date(), replacedById: replacement!.id })
      .where(eq(schema.refreshTokens.id, row.id));

    return { raw: newRaw, userId: row.userId, orgId: row.orgId };
  }

  async revokeRefresh(raw: string): Promise<void> {
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.tokenHash, this.sha256(raw)));
  }
}
