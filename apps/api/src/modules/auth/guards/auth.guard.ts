import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type TenantContext } from '@noah/domain';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { AuthService } from '../auth.service.js';
import {
  ALLOW_PENDING_2FA_KEY,
  type AuthenticatedStaffUser,
  PUBLIC_KEY,
} from '../decorators/roles.decorator.js';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: AuthenticatedStaffUser;
  tenantContext?: TenantContext;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractAccessToken(req);
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Autenticación requerida.' });
    }

    const payload = this.authService.verifyAccessToken(token);
    const allowPending2fa = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_2FA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (payload.scope === '2fa_setup' && !allowPending2fa) {
      throw new ForbiddenException({
        code: 'TOTP_SETUP_REQUIRED',
        message: 'Debes configurar el segundo factor (2FA) antes de acceder al dashboard.',
      });
    }

    const user = await this.prisma.staffUser.findUnique({
      where: { id: payload.sub },
      include: { tenants: { select: { tenantId: true } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'USER_INACTIVE', message: 'Usuario inactivo.' });
    }

    if (!user.totpEnabled && !allowPending2fa) {
      throw new ForbiddenException({
        code: 'TOTP_SETUP_REQUIRED',
        message: 'Debes configurar el segundo factor (2FA) antes de acceder al dashboard.',
      });
    }

    if (payload.sid) {
      const session = await this.prisma.staffSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Sesión revocada.' });
      }
      const idleMins = Number(process.env['SESSION_IDLE_MINUTES'] ?? 30);
      const maxIdleMs = (Number.isFinite(idleMins) && idleMins > 0 ? idleMins : 30) * 60 * 1000;
      if (Date.now() - session.lastActivityAt.getTime() > maxIdleMs) {
        await this.prisma.staffSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException({
          code: 'SESSION_IDLE_EXPIRED',
          message: 'Sesión cerrada por inactividad.',
        });
      }
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      });
    }

    const tenantIds = user.tenants.map((t) => t.tenantId);
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      totpEnabled: user.totpEnabled,
      tenantIds,
      tokenScope: payload.scope,
    };

    const requestedTenantHeader = req.headers['x-tenant-id'];
    const requestedTenantId = Array.isArray(requestedTenantHeader)
      ? requestedTenantHeader[0]
      : requestedTenantHeader;

    if (requestedTenantId) {
      const hasAccess = user.role === 'SUPERADMIN' || tenantIds.includes(requestedTenantId);
      if (!hasAccess) {
        throw new ForbiddenException({
          code: 'TENANT_ACCESS_DENIED',
          message: 'No tienes permiso para acceder a este edificio.',
        });
      }
      req.tenantContext = {
        tenantId: requestedTenantId,
        actorType: 'STAFF',
        actorId: user.id,
        channel: 'DASHBOARD',
        role: user.role,
      };
    }

    return true;
  }

  private extractAccessToken(req: AuthRequest): string | undefined {
    const authHeader = req.headers['authorization'];
    const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (raw && raw.startsWith('Bearer ')) {
      return raw.slice(7).trim();
    }
    return req.cookies?.['noah_access'];
  }
}
