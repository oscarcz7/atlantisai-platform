import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type StaffRole } from '@noah/domain';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from './crypto/field-encryption.service.js';
import { TotpService } from './crypto/totp.service.js';
import { MAILER_TOKEN, type Mailer } from './mailer/mailer.interface.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SETUP_2FA_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: StaffRole;
  scope: 'full' | '2fa_setup';
  sid?: string;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: StaffRole;
    totpEnabled: boolean;
    tenants: Array<{ id: string; code: string; name: string }>;
  };
}

export interface LoginResult {
  requires2faSetup?: boolean;
  setupToken?: string;
  tokens?: AuthTokensResult;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FieldEncryptionService) private readonly encryption: FieldEncryptionService,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(MAILER_TOKEN) private readonly mailer: Mailer,
  ) {}

  private getJwtSecret(): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('JWT_SECRET is required in production');
      }
      return 'noah-local-dev-jwt-secret-change-me';
    }
    return secret;
  }

  private getIdleTimeoutMs(): number {
    const mins = Number(process.env['SESSION_IDLE_MINUTES'] ?? 30);
    return (Number.isFinite(mins) && mins > 0 ? mins : 30) * 60 * 1000;
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verifyAccessToken(token: string): JwtAccessPayload {
    try {
      return jwt.verify(token, this.getJwtSecret()) as JwtAccessPayload;
    } catch {
      throw new DomainError('INVALID_TOKEN', 'Sesión inválida o expirada.', 401);
    }
  }

  async login(
    input: { email: string; password: string; totpCode?: string; recoveryCode?: string },
    meta: RequestMeta = {},
    now: Date = new Date(),
  ): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.staffUser.findUnique({
      where: { email },
      include: {
        tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
      },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      await this.recordAuthAudit(user?.id ?? null, null, 'LOGIN_FAILED', meta.ipAddress, {
        reason: !user ? 'UNKNOWN_EMAIL' : !user.isActive ? 'USER_INACTIVE' : 'NO_PASSWORD',
      });
      throw new DomainError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.', 401);
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      await this.recordAuthAudit(user.id, user.id, 'LOGIN_BLOCKED_LOCKED', meta.ipAddress);
      throw new DomainError(
        'ACCOUNT_LOCKED',
        'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta nuevamente en unos minutos.',
        423,
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.staffUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextAttempts,
          lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
        },
      });
      await this.recordAuthAudit(
        user.id,
        user.id,
        shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        meta.ipAddress,
        { attempts: nextAttempts },
      );
      if (shouldLock) {
        throw new DomainError(
          'ACCOUNT_LOCKED',
          'Cuenta bloqueada por 15 minutos tras 5 intentos fallidos.',
          423,
        );
      }
      throw new DomainError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.', 401);
    }

    // Password is valid; if 2FA is not yet configured, return setup-only token
    if (!user.totpEnabled || !user.totpSecretEnc) {
      const setupToken = this.signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        scope: '2fa_setup',
      });
      return { requires2faSetup: true, setupToken };
    }

    // Verify 2FA (TOTP code or single-use recovery code)
    let secondFactorOk = false;
    if (input.totpCode) {
      const secret = this.encryption.decrypt(user.totpSecretEnc);
      secondFactorOk = this.totp.verifyCode(secret, input.totpCode, now.getTime());
    } else if (input.recoveryCode) {
      const codeHash = this.encryption.hashToken(input.recoveryCode.trim().toUpperCase());
      const stored = await this.prisma.staffRecoveryCode.findFirst({
        where: { staffUserId: user.id, codeHash, usedAt: null },
      });
      if (stored) {
        await this.prisma.staffRecoveryCode.update({
          where: { id: stored.id },
          data: { usedAt: now },
        });
        secondFactorOk = true;
      }
    } else {
      throw new DomainError(
        'TOTP_REQUIRED',
        'Ingresa el código de 6 dígitos de tu aplicación autenticadora.',
        401,
      );
    }

    if (!secondFactorOk) {
      await this.recordAuthAudit(user.id, user.id, 'LOGIN_FAILED_2FA', meta.ipAddress);
      throw new DomainError('INVALID_TOTP', 'Código de verificación inválido.', 401);
    }

    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });

    const tokens = await this.createSessionAndTokens(user, meta, now);
    await this.recordAuthAudit(user.id, user.id, 'LOGIN_SUCCESS', meta.ipAddress);
    return { tokens };
  }

  async setupTotp(userId: string): Promise<{ secret: string; otpAuthUri: string; qrDataUrl: string }> {
    const user = await this.prisma.staffUser.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado.', 404);
    }
    const secret = this.totp.generateSecret();
    const secretEnc = this.encryption.encrypt(secret);
    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { totpSecretEnc: secretEnc, totpEnabled: false },
    });
    const otpAuthUri = this.totp.buildOtpAuthUri(user.email, secret);
    const qrDataUrl = await this.totp.generateQrDataUrl(otpAuthUri);
    return { secret, otpAuthUri, qrDataUrl };
  }

  async confirmTotp(
    userId: string,
    code: string,
    meta: RequestMeta = {},
    now: Date = new Date(),
  ): Promise<{ recoveryCodes: string[]; tokens: AuthTokensResult }> {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: userId },
      include: {
        tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!user || !user.isActive || !user.totpSecretEnc) {
      throw new DomainError('TOTP_NOT_INITIALIZED', 'Primero debes iniciar la configuración de 2FA.', 400);
    }

    const secret = this.encryption.decrypt(user.totpSecretEnc);
    if (!this.totp.verifyCode(secret, code, now.getTime())) {
      throw new DomainError('INVALID_TOTP', 'El código TOTP no es válido.', 422);
    }

    const recoveryCodes = this.totp.generateRecoveryCodes(8);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffRecoveryCode.deleteMany({ where: { staffUserId: user.id } });
      await tx.staffRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({
          id: generateUuidV7(now.getTime()),
          staffUserId: user.id,
          codeHash: this.encryption.hashToken(c),
        })),
      });
      await tx.staffUser.update({
        where: { id: user.id },
        data: { totpEnabled: true, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
      });
    });

    await this.recordAuthAudit(user.id, user.id, 'TOTP_ENABLED', meta.ipAddress);
    const tokens = await this.createSessionAndTokens({ ...user, totpEnabled: true }, meta, now);
    return { recoveryCodes, tokens };
  }

  async refresh(
    refreshToken: string,
    meta: RequestMeta = {},
    now: Date = new Date(),
  ): Promise<AuthTokensResult> {
    const tokenHash = this.encryption.hashToken(refreshToken);
    const session = await this.prisma.staffSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        staffUser: {
          include: {
            tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new DomainError('SESSION_INVALID', 'La sesión ha expirado. Inicia sesión nuevamente.', 401);
    }

    const idleMs = now.getTime() - session.lastActivityAt.getTime();
    if (idleMs > this.getIdleTimeoutMs()) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      await this.recordAuthAudit(
        session.staffUserId,
        session.staffUserId,
        'SESSION_EXPIRED_IDLE',
        meta.ipAddress,
      );
      throw new DomainError(
        'SESSION_IDLE_EXPIRED',
        'Tu sesión se cerró por inactividad. Inicia sesión nuevamente.',
        401,
      );
    }

    if (!session.staffUser.isActive || !session.staffUser.totpEnabled) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new DomainError('USER_INACTIVE', 'Usuario desactivado o sin 2FA activo.', 401);
    }

    const nextRefresh = randomBytes(32).toString('base64url');
    await this.prisma.staffSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.encryption.hashToken(nextRefresh),
        lastActivityAt: now,
      },
    });

    const accessToken = this.signAccessToken({
      sub: session.staffUser.id,
      email: session.staffUser.email,
      role: session.staffUser.role,
      scope: 'full',
      sid: session.id,
    });

    const tenants = await this.resolveUserTenants(session.staffUser);
    return {
      accessToken,
      refreshToken: nextRefresh,
      user: {
        id: session.staffUser.id,
        email: session.staffUser.email,
        fullName: session.staffUser.fullName,
        role: session.staffUser.role,
        totpEnabled: session.staffUser.totpEnabled,
        tenants,
      },
    };
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta = {}): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const tokenHash = this.encryption.hashToken(refreshToken);
    const session = await this.prisma.staffSession.findUnique({
      where: { refreshTokenHash: tokenHash },
    });
    if (session && !session.revokedAt) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.recordAuthAudit(session.staffUserId, session.staffUserId, 'LOGOUT', meta.ipAddress);
    }
  }

  async acceptInvite(
    token: string,
    password: string,
    meta: RequestMeta = {},
    now: Date = new Date(),
  ): Promise<{ requires2faSetup: true; setupToken: string }> {
    const tokenHash = this.encryption.hashToken(token);
    const record = await this.prisma.staffToken.findUnique({
      where: { tokenHash },
      include: { staffUser: true },
    });

    if (
      !record ||
      record.type !== 'INVITE' ||
      record.usedAt ||
      record.expiresAt <= now ||
      !record.staffUser.isActive
    ) {
      throw new DomainError('INVALID_INVITE', 'La invitación no es válida o ya venció.', 400);
    }

    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: record.staffUserId },
        data: { passwordHash },
      });
      await tx.staffToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
    });

    await this.recordAuthAudit(record.staffUserId, record.staffUserId, 'INVITE_ACCEPTED', meta.ipAddress);
    const setupToken = this.signAccessToken({
      sub: record.staffUser.id,
      email: record.staffUser.email,
      role: record.staffUser.role,
      scope: '2fa_setup',
    });
    return { requires2faSetup: true, setupToken };
  }

  async requestPasswordReset(email: string, meta: RequestMeta = {}, now: Date = new Date()): Promise<void> {
    const user = await this.prisma.staffUser.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.isActive) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.staffToken.create({
      data: {
        id: generateUuidV7(now.getTime()),
        staffUserId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: this.encryption.hashToken(rawToken),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mailer.sendPasswordReset({
      to: user.email,
      fullName: user.fullName,
      resetToken: rawToken,
    });
    await this.recordAuthAudit(user.id, user.id, 'PASSWORD_RESET_REQUESTED', meta.ipAddress);
  }

  async resetPassword(
    token: string,
    newPassword: string,
    meta: RequestMeta = {},
    now: Date = new Date(),
  ): Promise<void> {
    const tokenHash = this.encryption.hashToken(token);
    const record = await this.prisma.staffToken.findUnique({
      where: { tokenHash },
      include: { staffUser: true },
    });

    if (
      !record ||
      record.type !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt <= now ||
      !record.staffUser.isActive
    ) {
      throw new DomainError('INVALID_RESET_TOKEN', 'El enlace de recuperación no es válido o expiró.', 400);
    }

    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: record.staffUserId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.staffToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });
      await tx.staffSession.updateMany({
        where: { staffUserId: record.staffUserId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await this.recordAuthAudit(
      record.staffUserId,
      record.staffUserId,
      'PASSWORD_RESET_COMPLETED',
      meta.ipAddress,
    );
  }

  async getMe(userId: string) {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: userId },
      include: {
        tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!user || !user.isActive) {
      throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado.', 404);
    }
    const tenants = await this.resolveUserTenants(user);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      totpEnabled: user.totpEnabled,
      tenants,
    };
  }

  private async resolveUserTenants(user: {
    role: StaffRole;
    tenants: Array<{ tenant: { id: string; code: string; name: string } }>;
  }): Promise<Array<{ id: string; code: string; name: string }>> {
    if (user.role === 'SUPERADMIN') {
      return this.prisma.tenant.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      });
    }
    return user.tenants.map((t) => t.tenant);
  }

  private async createSessionAndTokens(
    user: {
      id: string;
      email: string;
      fullName: string;
      role: StaffRole;
      totpEnabled: boolean;
      tenants: Array<{ tenant: { id: string; code: string; name: string } }>;
    },
    meta: RequestMeta,
    now: Date,
  ): Promise<AuthTokensResult> {
    const sessionId = generateUuidV7(now.getTime());
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.staffSession.create({
      data: {
        id: sessionId,
        staffUserId: user.id,
        refreshTokenHash: this.encryption.hashToken(refreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        lastActivityAt: now,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      scope: 'full',
      sid: sessionId,
    });

    const tenants = await this.resolveUserTenants(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        totpEnabled: user.totpEnabled,
        tenants,
      },
    };
  }

  private signAccessToken(payload: JwtAccessPayload): string {
    const expiresIn =
      payload.scope === '2fa_setup' ? SETUP_2FA_TTL_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
    return jwt.sign(payload, this.getJwtSecret(), { expiresIn });
  }

  async recordAuthAudit(
    staffUserId: string | null,
    actorId: string | null,
    action: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.staffAuthAudit.create({
      data: {
        id: generateUuidV7(),
        staffUserId,
        actorId,
        action,
        ipAddress,
        metadata: metadata as object | undefined,
      },
    });
  }
}
