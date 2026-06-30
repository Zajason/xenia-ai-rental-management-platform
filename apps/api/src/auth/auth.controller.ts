import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../common/current-org.decorator.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, Roles } from './decorators.js';
import type { AuthUser } from './decorators.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';
import {
  acceptInviteSchema,
  inviteSchema,
  loginSchema,
  logoutSchema,
  magicLinkSchema,
  refreshSchema,
  registerSchema,
  verifyMagicLinkSchema,
} from './dto.js';
import type {
  AcceptInviteDto,
  InviteDto,
  LoginDto,
  LogoutDto,
  MagicLinkDto,
  RefreshDto,
  RegisterDto,
  VerifyMagicLinkDto,
} from './dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.auth.register(body, ua);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.auth.login(body, ua);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.auth.refresh(body.refreshToken, ua);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto) {
    return this.auth.logout(body.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  // --- invitations (provision staff into an org) ---
  @ApiBearerAuth()
  @Roles('manager')
  @Post('invitations')
  invite(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteDto,
  ) {
    return this.auth.createInvitation(orgId, body);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.auth.acceptInvitation(body, ua);
  }

  // --- magic links (passwordless guest / vendor / cleaner) ---
  @ApiBearerAuth()
  @Roles('manager')
  @Post('magic-links')
  magicLink(
    @CurrentOrg() orgId: string,
    @Body(new ZodValidationPipe(magicLinkSchema)) body: MagicLinkDto,
  ) {
    return this.auth.issueMagicLink(orgId, body);
  }

  @Public()
  @Post('magic-links/verify')
  @HttpCode(200)
  verifyMagicLink(@Body(new ZodValidationPipe(verifyMagicLinkSchema)) body: VerifyMagicLinkDto) {
    return this.auth.verifyMagicLink(body.token);
  }
}
