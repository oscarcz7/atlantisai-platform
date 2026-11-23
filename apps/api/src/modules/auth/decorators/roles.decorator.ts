import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { type StaffRole, type TenantContext } from '@noah/domain';

export const ROLES_KEY = 'auth:roles';
export const PUBLIC_KEY = 'auth:public';
export const ALLOW_PENDING_2FA_KEY = 'auth:allow_pending_2fa';

export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const AllowPending2fa = () => SetMetadata(ALLOW_PENDING_2FA_KEY, true);

export interface AuthenticatedStaffUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly totpEnabled: boolean;
  readonly tenantIds: string[];
  readonly tokenScope: 'full' | '2fa_setup';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedStaffUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedStaffUser }>();
    return req.user;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const req = ctx.switchToHttp().getRequest<{ tenantContext?: TenantContext }>();
    return req.tenantContext;
  },
);
