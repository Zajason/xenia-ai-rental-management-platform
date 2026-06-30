import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, db, eq, schema, sql, withTenant } from '@xenia/db';
import type { Role } from '@xenia/shared';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import type {
  AcceptInviteDto,
  InviteDto,
  LoginDto,
  MagicLinkDto,
  RegisterDto,
} from './dto.js';

interface Membership {
  org_id: string;
  role: Role;
  org_slug: string;
  org_name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  // ---- helpers -------------------------------------------------------------

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48);
    return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
  }

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async findUserByEmail(email: string) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()));
    return user;
  }

  private async membershipsOf(userId: string): Promise<Membership[]> {
    const res = await db.execute(sql`SELECT * FROM auth_user_memberships(${userId})`);
    return res.rows as unknown as Membership[];
  }

  private async issueSession(userId: string, orgId: string, role: Role, userAgent?: string) {
    const accessToken = await this.tokens.signAccess({
      sub: userId,
      org: orgId,
      role,
      scope: 'staff',
    });
    const refreshToken = await this.tokens.issueRefresh(userId, orgId, userAgent);
    return { accessToken, refreshToken };
  }

  // ---- staff: register / login / refresh / logout / me ---------------------

  async register(dto: RegisterDto, userAgent?: string) {
    if (await this.findUserByEmail(dto.email)) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashed = await this.passwords.hash(dto.password);
    const [user] = await db
      .insert(schema.users)
      .values({ email: dto.email.toLowerCase(), name: dto.name, hashedPassword: hashed })
      .returning();

    const [org] = await db
      .insert(schema.organizations)
      .values({ name: dto.orgName, slug: this.slugify(dto.orgName) })
      .returning();

    await withTenant(org!.id, (tx) =>
      tx.insert(schema.memberships).values({ orgId: org!.id, userId: user!.id, role: 'owner' }),
    );

    const session = await this.issueSession(user!.id, org!.id, 'owner', userAgent);
    return {
      user: { id: user!.id, email: user!.email, name: user!.name },
      org: { id: org!.id, slug: org!.slug, name: org!.name },
      role: 'owner' as Role,
      ...session,
    };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.findUserByEmail(dto.email);
    // Verify against a dummy hash even when the user is missing, to blunt timing
    // attacks that probe which emails exist.
    const ok = user?.hashedPassword
      ? await this.passwords.verify(user.hashedPassword, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

    const memberships = await this.membershipsOf(user.id);
    if (memberships.length === 0) {
      throw new ForbiddenException('This account has no organization membership');
    }

    let membership: Membership | undefined;
    if (dto.orgSlug) {
      membership = memberships.find((m) => m.org_slug === dto.orgSlug);
      if (!membership) throw new ForbiddenException('Not a member of that organization');
    } else if (memberships.length === 1) {
      membership = memberships[0];
    } else {
      throw new BadRequestException({
        message: 'Multiple organizations — specify orgSlug',
        organizations: memberships.map((m) => ({ slug: m.org_slug, name: m.org_name })),
      });
    }

    const session = await this.issueSession(user.id, membership!.org_id, membership!.role, userAgent);
    return {
      user: { id: user.id, email: user.email, name: user.name },
      org: { id: membership!.org_id, slug: membership!.org_slug, name: membership!.org_name },
      role: membership!.role,
      ...session,
    };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const rotated = await this.tokens.rotateRefresh(refreshToken, userAgent);
    // Re-read the role for the org (it may have changed since issue).
    const [m] = await withTenant(rotated.orgId, (tx) =>
      tx
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, rotated.userId),
            eq(schema.memberships.orgId, rotated.orgId),
          ),
        ),
    );
    if (!m) throw new ForbiddenException('Membership revoked');

    const accessToken = await this.tokens.signAccess({
      sub: rotated.userId,
      org: rotated.orgId,
      role: m.role,
      scope: 'staff',
    });
    return { accessToken, refreshToken: rotated.raw, role: m.role };
  }

  async logout(refreshToken: string) {
    await this.tokens.revokeRefresh(refreshToken);
    return { ok: true };
  }

  async me(principal: { userId: string; orgId: string; role: string; scope: 'staff' | 'magic' }) {
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, principal.orgId));
    const orgInfo = org ? { id: org.id, slug: org.slug, name: org.name } : null;

    // Magic-link principals (guest/vendor/cleaner) have no users row.
    if (principal.scope === 'magic') {
      return { subjectId: principal.userId, org: orgInfo, role: principal.role, scope: 'magic' };
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, principal.userId));
    if (!user) throw new NotFoundException('User not found');
    return {
      user: { id: user.id, email: user.email, name: user.name },
      org: orgInfo,
      role: principal.role,
      scope: 'staff',
    };
  }

  // ---- invitations (provision managers/admins/cleaners) --------------------

  async createInvitation(orgId: string, dto: InviteDto) {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    const [inv] = await withTenant(orgId, (tx) =>
      tx
        .insert(schema.invitations)
        .values({
          orgId,
          email: dto.email.toLowerCase(),
          role: dto.role,
          tokenHash: this.sha256(rawToken),
          expiresAt,
        })
        .returning(),
    );
    // The raw token would normally be emailed; returned here so it is testable.
    return { invitationId: inv!.id, token: rawToken, role: dto.role, expiresAt };
  }

  async acceptInvitation(dto: AcceptInviteDto, userAgent?: string) {
    // invitations is org-scoped (RLS) but we look it up by token hash before any
    // tenant context exists, so use the privileged path via the SQL we control.
    const res = await db.execute(
      sql`SELECT id, org_id, email, role, expires_at, accepted_at, is_active
          FROM invitations WHERE token_hash = ${this.sha256(dto.token)}`,
    );
    const inv = res.rows[0] as
      | {
          id: string;
          org_id: string;
          email: string;
          role: Role;
          expires_at: Date;
          accepted_at: Date | null;
          is_active: boolean;
        }
      | undefined;
    if (!inv || !inv.is_active || inv.accepted_at || new Date(inv.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    let user = await this.findUserByEmail(inv.email);
    if (!user) {
      const hashed = await this.passwords.hash(dto.password);
      [user] = await db
        .insert(schema.users)
        .values({ email: inv.email, name: dto.name, hashedPassword: hashed })
        .returning();
    }

    await withTenant(inv.org_id, async (tx) => {
      await tx
        .insert(schema.memberships)
        .values({ orgId: inv.org_id, userId: user!.id, role: inv.role });
      await tx
        .update(schema.invitations)
        .set({ acceptedAt: new Date(), isActive: false })
        .where(eq(schema.invitations.id, inv.id));
    });

    const session = await this.issueSession(user!.id, inv.org_id, inv.role, userAgent);
    return {
      user: { id: user!.id, email: user!.email, name: user!.name },
      role: inv.role,
      ...session,
    };
  }

  // ---- magic links (passwordless guest / vendor / cleaner) -----------------

  async issueMagicLink(orgId: string, dto: MagicLinkDto) {
    const rawToken = randomBytes(32).toString('base64url');
    const ttl = (dto.ttlMinutes ?? 60) * 60_000;
    const expiresAt = new Date(Date.now() + ttl);
    await withTenant(orgId, (tx) =>
      tx.insert(schema.magicLinks).values({
        orgId,
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        tokenHash: this.sha256(rawToken),
        expiresAt,
      }),
    );
    return { token: rawToken, expiresAt };
  }

  async verifyMagicLink(token: string) {
    const res = await db.execute(
      sql`SELECT id, org_id, subject_type, subject_id, expires_at, used_at
          FROM magic_links WHERE token_hash = ${this.sha256(token)}`,
    );
    const link = res.rows[0] as
      | {
          id: string;
          org_id: string;
          subject_type: string;
          subject_id: string;
          expires_at: Date;
          used_at: Date | null;
        }
      | undefined;
    if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired link');
    }

    await db
      .update(schema.magicLinks)
      .set({ usedAt: new Date() })
      .where(eq(schema.magicLinks.id, link.id));

    const role = link.subject_type as 'guest' | 'vendor' | 'cleaner' | 'staff';
    const accessToken = await this.tokens.signAccess(
      { sub: link.subject_id, org: link.org_id, role, scope: 'magic' },
      true,
    );
    return { accessToken, role, subjectId: link.subject_id, orgId: link.org_id };
  }
}
