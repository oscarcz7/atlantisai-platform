import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type StaffRole } from '@noah/domain';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { FieldEncryptionService } from './crypto/field-encryption.service.js';
import { type AuthenticatedStaffUser } from './decorators/roles.decorator.js';
import { MAILER_TOKEN, type Mailer } from './mailer/mailer.interface.js';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const ADMIN_MANAGED_ROLES: StaffRole[] = ['ACCOUNTANT', 'GUARD'];

@Injectable()
export class StaffUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FieldEncryptionService) private readonly encryption: FieldEncryptionService,
    @Inject(MAILER_TOKEN) private readonly mailer: Mailer,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  private assertAdminScope(
    actor: AuthenticatedStaffUser,
    targetRole: StaffRole,
    targetTenantIds: string[],
  ) {
    if (actor.role === 'SUPERADMIN') return;
    if (!ADMIN_MANAGED_ROLES.includes(targetRole)) {
      throw new DomainError(
        'ROLE_NOT_ALLOWED',
        'Un Administrador solo puede gestionar usuarios de tipo Contador o Guardia.',
        403,
      );
    }
    if (targetTenantIds.length === 0) {
      throw new DomainError(
        'TENANT_REQUIRED',
        'Debes asignar al menos uno de tus edificios al usuario.',
        422,
      );
    }
    const unauthorized = targetTenantIds.find((id) => !actor.tenantIds.includes(id));
    if (unauthorized) {
      throw new DomainError(
        'TENANT_ACCESS_DENIED',
        'Solo puedes asignar edificios que tú administras.',
        403,
      );
    }
  }

  async list(actor: AuthenticatedStaffUser) {
    const where =
      actor.role === 'SUPERADMIN'
        ? {}
        : {
            role: { in: ADMIN_MANAGED_ROLES },
            tenants: { some: { tenantId: { in: actor.tenantIds } } },
          };

    const users = await this.prisma.staffUser.findMany({
      where,
      include: {
        tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      totpEnabled: u.totpEnabled,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      tenants: u.tenants.map((t) => t.tenant),
    }));
  }

  async invite(
    actor: AuthenticatedStaffUser,
    input: { email: string; fullName: string; role: StaffRole; tenantIds: string[] },
    ipAddress?: string,
    now: Date = new Date(),
  ) {
    this.assertAdminScope(actor, input.role, input.tenantIds);

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      throw new DomainError('EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo.', 409);
    }

    const userId = generateUuidV7(now.getTime());
    const rawInviteToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.create({
        data: {
          id: userId,
          email,
          fullName: input.fullName.trim(),
          role: input.role,
          isActive: true,
          tenants: {
            create: input.tenantIds.map((tenantId) => ({ tenantId })),
          },
        },
      });

      await tx.staffToken.create({
        data: {
          id: generateUuidV7(now.getTime()),
          staffUserId: userId,
          type: 'INVITE',
          tokenHash: this.encryption.hashToken(rawInviteToken),
          expiresAt,
        },
      });
    });

    await this.mailer.sendInvitation({
      to: email,
      fullName: input.fullName.trim(),
      inviteToken: rawInviteToken,
    });

    await this.authService.recordAuthAudit(userId, actor.id, 'USER_INVITED', ipAddress, {
      role: input.role,
      tenantIds: input.tenantIds,
    });

    return {
      id: userId,
      email,
      fullName: input.fullName.trim(),
      role: input.role,
      tenantIds: input.tenantIds,
      inviteExpiresAt: expiresAt.toISOString(),
    };
  }

  async update(
    actor: AuthenticatedStaffUser,
    userId: string,
    input: { fullName?: string; role?: StaffRole; isActive?: boolean; tenantIds?: string[] },
    ipAddress?: string,
    now: Date = new Date(),
  ) {
    const existing = await this.prisma.staffUser.findUnique({
      where: { id: userId },
      include: { tenants: true },
    });
    if (!existing) {
      throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado.', 404);
    }

    const existingTenantIds = existing.tenants.map((t) => t.tenantId);
    if (actor.role !== 'SUPERADMIN') {
      const sharesTenant = existingTenantIds.some((id) => actor.tenantIds.includes(id));
      if (!ADMIN_MANAGED_ROLES.includes(existing.role) || !sharesTenant) {
        throw new DomainError(
          'USER_ACCESS_DENIED',
          'No tienes permiso para modificar este usuario.',
          403,
        );
      }
      const nextRole = input.role ?? existing.role;
      const nextTenants = input.tenantIds ?? existingTenantIds;
      this.assertAdminScope(actor, nextRole, nextTenants);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: userId },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      if (input.tenantIds !== undefined) {
        await tx.staffUserTenant.deleteMany({ where: { staffUserId: userId } });
        if (input.tenantIds.length > 0) {
          await tx.staffUserTenant.createMany({
            data: input.tenantIds.map((tenantId) => ({ staffUserId: userId, tenantId })),
          });
        }
      }

      if (input.isActive === false) {
        await tx.staffSession.updateMany({
          where: { staffUserId: userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });

    await this.authService.recordAuthAudit(
      userId,
      actor.id,
      input.isActive === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      ipAddress,
      {
        before: {
          role: existing.role,
          isActive: existing.isActive,
          tenantIds: existingTenantIds,
        },
        after: input,
      },
    );

    const updated = await this.prisma.staffUser.findUniqueOrThrow({
      where: { id: userId },
      include: {
        tenants: { include: { tenant: { select: { id: true, code: true, name: true } } } },
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      role: updated.role,
      isActive: updated.isActive,
      totpEnabled: updated.totpEnabled,
      tenants: updated.tenants.map((t) => t.tenant),
    };
  }

  async deactivate(
    actor: AuthenticatedStaffUser,
    userId: string,
    ipAddress?: string,
    now: Date = new Date(),
  ) {
    return this.update(actor, userId, { isActive: false }, ipAddress, now);
  }
}
