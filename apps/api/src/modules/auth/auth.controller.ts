import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import {
  AllowPending2fa,
  type AuthenticatedStaffUser,
  CurrentUser,
  Public,
  Roles,
} from './decorators/roles.decorator.js';
import {
  AcceptInviteDto,
  ConfirmTotpDto,
  LoginDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';

interface ExpressLikeReq {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}

interface ExpressLikeRes {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

const REFRESH_COOKIE = 'noah_refresh';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    path: '/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: ExpressLikeReq,
    @Res({ passthrough: true }) res: ExpressLikeRes,
  ) {
    const userAgent = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent'];
    const result = await this.authService.login(dto, { ipAddress: req.ip, userAgent });

    if (result.requires2faSetup) {
      return { requires2faSetup: true, setupToken: result.setupToken };
    }

    if (result.tokens) {
      res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions());
      return {
        accessToken: result.tokens.accessToken,
        user: result.tokens.user,
      };
    }

    return result;
  }

  @AllowPending2fa()
  @Post('2fa/setup')
  async setup2fa(@CurrentUser() user: AuthenticatedStaffUser) {
    return this.authService.setupTotp(user.id);
  }

  @AllowPending2fa()
  @Post('2fa/confirm')
  @HttpCode(200)
  async confirm2fa(
    @CurrentUser() user: AuthenticatedStaffUser,
    @Body() dto: ConfirmTotpDto,
    @Req() req: ExpressLikeReq,
    @Res({ passthrough: true }) res: ExpressLikeRes,
  ) {
    const result = await this.authService.confirmTotp(user.id, dto.code, { ipAddress: req.ip });
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions());
    return {
      recoveryCodes: result.recoveryCodes,
      accessToken: result.tokens.accessToken,
      user: result.tokens.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: ExpressLikeReq, @Res({ passthrough: true }) res: ExpressLikeRes) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? '';
    const tokens = await this.authService.refresh(refreshToken, { ipAddress: req.ip });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions());
    return {
      accessToken: tokens.accessToken,
      user: tokens.user,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: ExpressLikeReq, @Res({ passthrough: true }) res: ExpressLikeRes) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE], { ipAddress: req.ip });
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: ExpressLikeReq) {
    return this.authService.acceptInvite(dto.token, dto.password, { ipAddress: req.ip });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: RequestPasswordResetDto, @Req() req: ExpressLikeReq) {
    await this.authService.requestPasswordReset(dto.email, { ipAddress: req.ip });
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: ExpressLikeReq) {
    await this.authService.resetPassword(dto.token, dto.newPassword, { ipAddress: req.ip });
    return { ok: true };
  }

  @Roles('SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD')
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedStaffUser) {
    return this.authService.getMe(user.id);
  }
}
