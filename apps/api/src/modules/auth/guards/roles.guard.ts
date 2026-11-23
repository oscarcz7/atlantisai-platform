import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type StaffRole } from '@noah/domain';
import {
  ALLOW_PENDING_2FA_KEY,
  type AuthenticatedStaffUser,
  PUBLIC_KEY,
  ROLES_KEY,
} from '../decorators/roles.decorator.js';

/**
 * Role-based access guard: DENY BY DEFAULT.
 * Every non-public endpoint must declare @Roles(...) or @AllowPending2fa().
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowPending2fa = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_2FA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowPending2fa) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Deny by default if endpoint did not explicitly specify @Roles()
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Acceso denegado por defecto.',
      });
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedStaffUser }>();
    if (!req.user || !requiredRoles.includes(req.user.role)) {
      throw new ForbiddenException({
        code: 'ROLE_FORBIDDEN',
        message: 'Tu rol no tiene permiso para realizar esta acción.',
      });
    }

    return true;
  }
}
