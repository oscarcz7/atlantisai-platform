import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type OccupancyRole, type TenantContext } from '@noah/domain';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { buildComboKey, validateAmenityInput } from '../catalog/catalog.validation.js';

const ALL_OCCUPANCY_ROLES: OccupancyRole[] = [
  'OWNER_RESIDENT',
  'OWNER_LANDLORD',
  'LONG_TERM_TENANT',
  'AIRBNB_HOST',
  'AIRBNB_GUEST',
];

export interface BuildingConfigImportJson {
  tenant: {
    code: string;
    name: string;
    ruc?: string;
    logoUrl?: string;
    timezone?: string;
    administrator?: Record<string, unknown>;
    security?: Record<string, unknown>;
    officeHours?: Record<string, unknown>;
    bankAccounts?: Array<Record<string, unknown>>;
  };
  settings: {
    monthlyFeePerSqmCents?: number;
    depositRequiredCents: number;
    arrearsToleranceMonths: number;
    paymentProofDeadlineMinutes: number;
    extraGuestDeclaredCents: number;
    extraGuestUndeclaredCents: number;
    entryMarginMinutes: number;
    generalAdvanceHours: number;
    shortNoticeAdvanceMinutes: number;
    frequencyWeekStart?: string;
    cancellationPolicy?: Record<string, unknown>;
  };
  unitTypes: Array<{ code: string; name: string; bedrooms?: number; includedGuests: number }>;
  amenities: Array<{
    code: string;
    name: string;
    capacity: number;
    maxDurationMinutes: number;
    schedule: Record<string, { open: string; close: string }> | null;
    frequency: { period: 'DAY' | 'WEEK' | 'MONTH'; max: number } | null;
    mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
    advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
    appliesGuestQuota: boolean;
    requiresDeposit: boolean;
    cleaningFeeCents: number;
    hasReader: boolean;
    allowedRoles: OccupancyRole[];
  }>;
  cleaningCombos: Array<{ amenities: string[]; feeCents: number }>;
  parking: {
    spots: number;
    freeMinutes: number;
    overtimeFeeCentsPerHour: number;
    rounding?: string;
  };
}

@Injectable()
export class TenantsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(user: { role: string; tenantIds: string[] }) {
    const includeAdmins = {
      staffUsers: {
        where: { staffUser: { role: 'ADMIN' as const } },
        include: {
          staffUser: { select: { id: true, fullName: true, email: true, isActive: true } },
        },
      },
    };
    const rows =
      user.role === 'SUPERADMIN'
        ? await this.prisma.tenant.findMany({ include: includeAdmins, orderBy: { name: 'asc' } })
        : await this.prisma.tenant.findMany({
            where: { id: { in: user.tenantIds } },
            include: includeAdmins,
            orderBy: { name: 'asc' },
          });

    return rows.map(({ staffUsers, ...tenant }) => ({
      ...tenant,
      admins: staffUsers.map((su) => su.staffUser),
    }));
  }

  private async syncBuildingAdmins(tenantId: string, adminUserIds: string[]) {
    const validAdmins =
      adminUserIds.length > 0
        ? await this.prisma.staffUser.findMany({
            where: { id: { in: adminUserIds }, role: 'ADMIN' },
            select: { id: true },
          })
        : [];
    const validIds = validAdmins.map((u) => u.id);

    await this.prisma.$transaction(async (tx) => {
      // Only remove existing ADMIN links for this building (preserves ACCOUNTANT/GUARD assignments)
      const currentAdminLinks = await tx.staffUserTenant.findMany({
        where: { tenantId, staffUser: { role: 'ADMIN' } },
        select: { staffUserId: true },
      });
      const currentIds = currentAdminLinks.map((l) => l.staffUserId);
      const toRemove = currentIds.filter((id) => !validIds.includes(id));
      const toAdd = validIds.filter((id) => !currentIds.includes(id));

      if (toRemove.length > 0) {
        await tx.staffUserTenant.deleteMany({
          where: { tenantId, staffUserId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.staffUserTenant.createMany({
          data: toAdd.map((staffUserId) => ({ staffUserId, tenantId })),
          skipDuplicates: true,
        });
      }
    });
  }

  async create(input: {
    code: string;
    name: string;
    ruc?: string;
    logoUrl?: string;
    timezone?: string;
    contacts?: Record<string, unknown>;
    officeHours?: Record<string, unknown>;
    bankAccounts?: Array<Record<string, unknown>>;
    adminUserIds?: string[];
  }) {
    const code = input.code.trim().toLowerCase();
    const existing = await this.prisma.tenant.findUnique({ where: { code } });
    if (existing) {
      throw new DomainError('TENANT_CODE_EXISTS', 'Ya existe un edificio con ese código.', 409);
    }

    const created = await this.prisma.tenant.create({
      data: {
        id: generateUuidV7(),
        code,
        name: input.name.trim(),
        ruc: input.ruc,
        logoUrl: input.logoUrl,
        timezone: input.timezone ?? 'America/Guayaquil',
        contacts: input.contacts as Prisma.InputJsonValue | undefined,
        officeHours: input.officeHours as Prisma.InputJsonValue | undefined,
        bankAccounts: input.bankAccounts as Prisma.InputJsonValue | undefined,
      },
    });

    if (input.adminUserIds && input.adminUserIds.length > 0) {
      await this.syncBuildingAdmins(created.id, input.adminUserIds);
    }

    // Initialize default settings & parking so the building is immediately configurable
    const ctx: TenantContext = {
      tenantId: created.id,
      actorType: 'SYSTEM',
      actorId: 'system',
      channel: 'SYSTEM',
    };
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.tenantSettings.create({
        data: {
          id: generateUuidV7(),
          tenantId: created.id,
          monthlyFeePerSqmCents: 0,
          depositRequiredCents: 20000,
          arrearsToleranceMonths: 2,
          paymentProofDeadlineMinutes: 240,
          extraGuestDeclaredCents: 500,
          extraGuestUndeclaredCents: 1000,
          entryMarginMinutes: 10,
          generalAdvanceHours: 24,
          shortNoticeAdvanceMinutes: 60,
          frequencyWeekStart: 'MONDAY',
          cancellationPolicy: { minHoursBefore: 24, cleaningFeeHandling: 'NON_REFUNDABLE' },
        },
      });
      await tx.parkingConfig.create({
        data: {
          id: generateUuidV7(),
          tenantId: created.id,
          spots: 4,
          freeMinutes: 180,
          overtimeFeeCentsPerHour: 200,
          rounding: 'CEIL_HOUR',
        },
      });
    });

    return created;
  }

  async update(
    tenantId: string,
    input: {
      name?: string;
      ruc?: string;
      logoUrl?: string;
      timezone?: string;
      contacts?: Record<string, unknown>;
      officeHours?: Record<string, unknown>;
      bankAccounts?: Array<Record<string, unknown>>;
      adminUserIds?: string[];
    },
    actorId = 'system',
  ) {
    const before = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!before) {
      throw new DomainError('TENANT_NOT_FOUND', 'Edificio no encontrado.', 404);
    }
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.ruc !== undefined ? { ruc: input.ruc } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.contacts !== undefined ? { contacts: input.contacts as Prisma.InputJsonValue } : {}),
        ...(input.officeHours !== undefined
          ? { officeHours: input.officeHours as Prisma.InputJsonValue }
          : {}),
        ...(input.bankAccounts !== undefined
          ? { bankAccounts: input.bankAccounts as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (input.adminUserIds !== undefined) {
      await this.syncBuildingAdmins(tenantId, input.adminUserIds);
    }

    // Constitution VII: building config changes — especially the bank accounts residents pay
    // into — must leave a before/after trail.
    const fields = ['name', 'ruc', 'logoUrl', 'timezone', 'contacts', 'officeHours', 'bankAccounts'] as const;
    const changed = fields.filter(
      (f) => input[f] !== undefined && JSON.stringify(before[f]) !== JSON.stringify(updated[f]),
    );
    if (changed.length > 0 || input.adminUserIds !== undefined) {
      const pick = (t: typeof before) => Object.fromEntries(changed.map((f) => [f, t[f]]));
      await this.prisma.withTenant(
        { tenantId, actorType: 'STAFF', actorId, channel: 'DASHBOARD' },
        (tx) =>
          tx.auditLog.create({
            data: {
              id: generateUuidV7(),
              tenantId,
              actorType: 'STAFF',
              actorId,
              action: changed.includes('bankAccounts') ? 'TENANT_BANK_ACCOUNTS_UPDATED' : 'TENANT_UPDATED',
              entity: 'Tenant',
              entityId: tenantId,
              channel: 'DASHBOARD',
              before: pick(before) as Prisma.InputJsonValue,
              after: {
                ...pick(updated),
                ...(input.adminUserIds !== undefined ? { adminUserIds: input.adminUserIds } : {}),
              } as Prisma.InputJsonValue,
            },
          }),
      );
    }

    return updated;
  }

  /**
   * Idempotent JSON import of a building's complete configuration (used by `pnpm db:seed`).
   */
  async importConfig(config: BuildingConfigImportJson, actorId = 'system') {
    const code = config.tenant.code.trim().toLowerCase();

    for (const amenity of config.amenities) {
      validateAmenityInput(amenity);
    }

    const tenant = await this.prisma.tenant.upsert({
      where: { code },
      update: {
        name: config.tenant.name.trim(),
        ruc: config.tenant.ruc,
        logoUrl: config.tenant.logoUrl,
        timezone: config.tenant.timezone ?? 'America/Guayaquil',
        contacts: {
          administrator: config.tenant.administrator ?? null,
          security: config.tenant.security ?? null,
        } as Prisma.InputJsonValue,
        officeHours: (config.tenant.officeHours ?? null) as Prisma.InputJsonValue,
        bankAccounts: (config.tenant.bankAccounts ?? []) as Prisma.InputJsonValue,
      },
      create: {
        id: generateUuidV7(),
        code,
        name: config.tenant.name.trim(),
        ruc: config.tenant.ruc,
        logoUrl: config.tenant.logoUrl,
        timezone: config.tenant.timezone ?? 'America/Guayaquil',
        contacts: {
          administrator: config.tenant.administrator ?? null,
          security: config.tenant.security ?? null,
        } as Prisma.InputJsonValue,
        officeHours: (config.tenant.officeHours ?? null) as Prisma.InputJsonValue,
        bankAccounts: (config.tenant.bankAccounts ?? []) as Prisma.InputJsonValue,
      },
    });

    const ctx: TenantContext = {
      tenantId: tenant.id,
      actorType: actorId === 'system' ? 'SYSTEM' : 'STAFF',
      actorId,
      channel: actorId === 'system' ? 'SYSTEM' : 'DASHBOARD',
    };

    return this.prisma.withTenant(ctx, async (tx) => {
      // 1. Settings
      const existingSettings = await tx.tenantSettings.findUnique({ where: { tenantId: tenant.id } });
      const settingsData = {
        monthlyFeePerSqmCents: config.settings.monthlyFeePerSqmCents ?? 0,
        depositRequiredCents: config.settings.depositRequiredCents,
        arrearsToleranceMonths: config.settings.arrearsToleranceMonths,
        paymentProofDeadlineMinutes: config.settings.paymentProofDeadlineMinutes,
        extraGuestDeclaredCents: config.settings.extraGuestDeclaredCents,
        extraGuestUndeclaredCents: config.settings.extraGuestUndeclaredCents,
        entryMarginMinutes: config.settings.entryMarginMinutes,
        generalAdvanceHours: config.settings.generalAdvanceHours,
        shortNoticeAdvanceMinutes: config.settings.shortNoticeAdvanceMinutes,
        frequencyWeekStart: config.settings.frequencyWeekStart ?? 'MONDAY',
        cancellationPolicy: (config.settings.cancellationPolicy ?? null) as Prisma.InputJsonValue,
      };
      if (existingSettings) {
        await tx.tenantSettings.update({ where: { id: existingSettings.id }, data: settingsData });
      } else {
        await tx.tenantSettings.create({
          data: { id: generateUuidV7(), tenantId: tenant.id, ...settingsData },
        });
      }

      // 2. Unit types (idempotent by code)
      for (const ut of config.unitTypes) {
        const utCode = ut.code.trim().toUpperCase();
        await tx.unitType.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: utCode } },
          update: {
            name: ut.name.trim(),
            bedrooms: ut.bedrooms ?? 1,
            includedGuests: ut.includedGuests,
          },
          create: {
            id: generateUuidV7(),
            tenantId: tenant.id,
            code: utCode,
            name: ut.name.trim(),
            bedrooms: ut.bedrooms ?? 1,
            includedGuests: ut.includedGuests,
          },
        });
      }

      // 3. Amenities & Access Matrix (idempotent by code)
      const amenityIdByCode = new Map<string, string>();
      for (const a of config.amenities) {
        const aCode = a.code.trim().toUpperCase();
        const savedAmenity = await tx.amenity.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: aCode } },
          update: {
            name: a.name.trim(),
            capacity: a.capacity,
            maxDurationMinutes: a.maxDurationMinutes,
            schedule: a.schedule ? (a.schedule as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            frequency: a.frequency ? (a.frequency as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            mode: a.mode,
            advancePolicy: a.advancePolicy,
            appliesGuestQuota: a.appliesGuestQuota,
            requiresDeposit: a.requiresDeposit,
            cleaningFeeCents: a.cleaningFeeCents,
            hasReader: a.hasReader,
          },
          create: {
            id: generateUuidV7(),
            tenantId: tenant.id,
            code: aCode,
            name: a.name.trim(),
            capacity: a.capacity,
            maxDurationMinutes: a.maxDurationMinutes,
            schedule: a.schedule ? (a.schedule as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            frequency: a.frequency ? (a.frequency as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            mode: a.mode,
            advancePolicy: a.advancePolicy,
            appliesGuestQuota: a.appliesGuestQuota,
            requiresDeposit: a.requiresDeposit,
            cleaningFeeCents: a.cleaningFeeCents,
            hasReader: a.hasReader,
          },
        });
        amenityIdByCode.set(aCode, savedAmenity.id);

        for (const role of ALL_OCCUPANCY_ROLES) {
          const allowed = a.allowedRoles.includes(role);
          await tx.amenityAccessRule.upsert({
            where: {
              tenantId_amenityId_occupancyRole: {
                tenantId: tenant.id,
                amenityId: savedAmenity.id,
                occupancyRole: role,
              },
            },
            update: { allowed },
            create: {
              id: generateUuidV7(),
              tenantId: tenant.id,
              amenityId: savedAmenity.id,
              occupancyRole: role,
              allowed,
            },
          });
        }
      }

      // 4. Cleaning combos (idempotent by comboKey)
      for (const combo of config.cleaningCombos) {
        const ids = combo.amenities.map((c) => {
          const id = amenityIdByCode.get(c.trim().toUpperCase());
          if (!id) {
            throw new DomainError('AMENITY_NOT_FOUND', `Área de combo desconocida: ${c}`, 422);
          }
          return id;
        });
        const comboKey = buildComboKey(ids);
        await tx.cleaningCombo.upsert({
          where: { tenantId_comboKey: { tenantId: tenant.id, comboKey } },
          update: { feeCents: combo.feeCents, amenityIds: comboKey.split('+') },
          create: {
            id: generateUuidV7(),
            tenantId: tenant.id,
            comboKey,
            amenityIds: comboKey.split('+'),
            feeCents: combo.feeCents,
          },
        });
      }

      // 5. Parking config
      await tx.parkingConfig.upsert({
        where: { tenantId: tenant.id },
        update: {
          spots: config.parking.spots,
          freeMinutes: config.parking.freeMinutes,
          overtimeFeeCentsPerHour: config.parking.overtimeFeeCentsPerHour,
          rounding: config.parking.rounding ?? 'CEIL_HOUR',
        },
        create: {
          id: generateUuidV7(),
          tenantId: tenant.id,
          spots: config.parking.spots,
          freeMinutes: config.parking.freeMinutes,
          overtimeFeeCentsPerHour: config.parking.overtimeFeeCentsPerHour,
          rounding: config.parking.rounding ?? 'CEIL_HOUR',
        },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenant.id,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'CONFIG_IMPORTED',
          entity: 'Tenant',
          entityId: tenant.id,
          channel: ctx.channel,
          after: {
            unitTypes: config.unitTypes.length,
            amenities: config.amenities.length,
            cleaningCombos: config.cleaningCombos.length,
          },
        },
      });

      return {
        tenantId: tenant.id,
        code: tenant.code,
        name: tenant.name,
        unitTypes: config.unitTypes.length,
        amenities: config.amenities.length,
        cleaningCombos: config.cleaningCombos.length,
      };
    });
  }

  /**
   * Clones only configuration (settings, unit types, amenities, access matrix, combos, parking)
   * into a new building in a single transaction while enforcing RLS.
   */
  async cloneTenant(
    sourceTenantId: string,
    target: { code: string; name: string },
    actorId: string,
  ) {
    const targetCode = target.code.trim().toLowerCase();
    const existingTarget = await this.prisma.tenant.findUnique({ where: { code: targetCode } });
    if (existingTarget) {
      throw new DomainError('TENANT_CODE_EXISTS', 'Ya existe un edificio con ese código.', 409);
    }

    const sourceTenant = await this.prisma.tenant.findUnique({ where: { id: sourceTenantId } });
    if (!sourceTenant) {
      throw new DomainError('TENANT_NOT_FOUND', 'Edificio origen no encontrado.', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      // Read source config under source RLS context
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sourceTenantId}, true)`;
      const settings = await tx.tenantSettings.findUnique({ where: { tenantId: sourceTenantId } });
      const unitTypes = await tx.unitType.findMany({ where: { tenantId: sourceTenantId } });
      const amenities = await tx.amenity.findMany({ where: { tenantId: sourceTenantId } });
      const accessRules = await tx.amenityAccessRule.findMany({ where: { tenantId: sourceTenantId } });
      const combos = await tx.cleaningCombo.findMany({ where: { tenantId: sourceTenantId } });
      const parking = await tx.parkingConfig.findUnique({ where: { tenantId: sourceTenantId } });

      // Create target building (global SaaS table)
      const newTenant = await tx.tenant.create({
        data: {
          id: generateUuidV7(),
          code: targetCode,
          name: target.name.trim(),
          timezone: sourceTenant.timezone,
        },
      });

      // Switch RLS context to target building
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${newTenant.id}, true)`;

      if (settings) {
        await tx.tenantSettings.create({
          data: {
            id: generateUuidV7(),
            tenantId: newTenant.id,
            monthlyFeePerSqmCents: settings.monthlyFeePerSqmCents,
            depositRequiredCents: settings.depositRequiredCents,
            arrearsToleranceMonths: settings.arrearsToleranceMonths,
            paymentProofDeadlineMinutes: settings.paymentProofDeadlineMinutes,
            extraGuestDeclaredCents: settings.extraGuestDeclaredCents,
            extraGuestUndeclaredCents: settings.extraGuestUndeclaredCents,
            entryMarginMinutes: settings.entryMarginMinutes,
            generalAdvanceHours: settings.generalAdvanceHours,
            shortNoticeAdvanceMinutes: settings.shortNoticeAdvanceMinutes,
            frequencyWeekStart: settings.frequencyWeekStart,
            cancellationPolicy: settings.cancellationPolicy ?? Prisma.JsonNull,
          },
        });
      }

      if (unitTypes.length > 0) {
        await tx.unitType.createMany({
          data: unitTypes.map((ut) => ({
            id: generateUuidV7(),
            tenantId: newTenant.id,
            code: ut.code,
            name: ut.name,
            bedrooms: ut.bedrooms,
            includedGuests: ut.includedGuests,
          })),
        });
      }

      const amenityIdMap = new Map<string, string>();
      for (const a of amenities) {
        const newId = generateUuidV7();
        amenityIdMap.set(a.id, newId);
        await tx.amenity.create({
          data: {
            id: newId,
            tenantId: newTenant.id,
            code: a.code,
            name: a.name,
            capacity: a.capacity,
            maxDurationMinutes: a.maxDurationMinutes,
            schedule: a.schedule ?? Prisma.JsonNull,
            frequency: a.frequency ?? Prisma.JsonNull,
            mode: a.mode,
            advancePolicy: a.advancePolicy,
            appliesGuestQuota: a.appliesGuestQuota,
            requiresDeposit: a.requiresDeposit,
            cleaningFeeCents: a.cleaningFeeCents,
            hasReader: a.hasReader,
          },
        });
      }

      if (accessRules.length > 0) {
        await tx.amenityAccessRule.createMany({
          data: accessRules.map((r) => ({
            id: generateUuidV7(),
            tenantId: newTenant.id,
            amenityId: amenityIdMap.get(r.amenityId)!,
            occupancyRole: r.occupancyRole,
            allowed: r.allowed,
          })),
        });
      }

      for (const c of combos) {
        const mappedIds = c.amenityIds.map((oldId) => amenityIdMap.get(oldId)!);
        const comboKey = buildComboKey(mappedIds);
        await tx.cleaningCombo.create({
          data: {
            id: generateUuidV7(),
            tenantId: newTenant.id,
            comboKey,
            amenityIds: comboKey.split('+'),
            feeCents: c.feeCents,
          },
        });
      }

      if (parking) {
        await tx.parkingConfig.create({
          data: {
            id: generateUuidV7(),
            tenantId: newTenant.id,
            spots: parking.spots,
            freeMinutes: parking.freeMinutes,
            overtimeFeeCentsPerHour: parking.overtimeFeeCentsPerHour,
            rounding: parking.rounding,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: newTenant.id,
          actorType: 'STAFF',
          actorId,
          action: 'TENANT_CLONED',
          entity: 'Tenant',
          entityId: newTenant.id,
          channel: 'DASHBOARD',
          after: { sourceTenantId, targetCode },
        },
      });

      return newTenant;
    });
  }

  async deleteTenant(tenantId: string, actorId = 'system') {
    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) {
      throw new DomainError('TENANT_NOT_FOUND', 'Edificio no encontrado.', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      const [reservationsCount, ledgerCount] = await Promise.all([
        tx.reservation.count({ where: { tenantId } }),
        tx.ledgerEntry.count({ where: { tenantId } }),
      ]);
      if (reservationsCount > 0 || ledgerCount > 0) {
        throw new DomainError(
          'TENANT_HAS_HISTORY',
          `No se puede eliminar "${existing.name}" porque tiene ${reservationsCount} reserva(s) y ${ledgerCount} movimiento(s) contable(s).`,
          409,
        );
      }
      // The audit trail has no FK to tenants, so this record outlives the tenant.
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          actorType: 'STAFF',
          actorId,
          action: 'TENANT_DELETED',
          entity: 'Tenant',
          entityId: tenantId,
          channel: 'DASHBOARD',
          before: { code: existing.code, name: existing.name, ruc: existing.ruc },
        },
      });
      await tx.tenant.delete({ where: { id: tenantId } });
      return { deleted: true, id: tenantId };
    });
  }
}
