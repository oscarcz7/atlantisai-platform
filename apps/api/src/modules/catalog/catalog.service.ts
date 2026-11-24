import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type OccupancyRole, type TenantContext } from '@noah/domain';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  type AmenityFrequency,
  type AmenitySchedule,
  buildComboKey,
  validateAmenityInput,
} from './catalog.validation.js';

export interface UpsertSettingsInput {
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
  cancellationPolicy?: Record<string, unknown> | null;
}

export interface UpsertAmenityInput {
  code: string;
  name: string;
  capacity: number;
  maxDurationMinutes: number;
  schedule?: AmenitySchedule;
  frequency?: AmenityFrequency | null;
  mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
  advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
  appliesGuestQuota: boolean;
  requiresDeposit: boolean;
  cleaningFeeCents: number;
  hasReader: boolean;
}

@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async recordAudit(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    action: string,
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        id: generateUuidV7(),
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.actorId,
        action,
        entity,
        entityId,
        channel: ctx.channel,
        before: before ? (before as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: after ? (after as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  async getSettings(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
  }

  async upsertSettings(ctx: TenantContext, input: UpsertSettingsInput) {
    const monthlyFeePerSqmCents = input.monthlyFeePerSqmCents ?? 0;
    if (
      monthlyFeePerSqmCents < 0 ||
      input.depositRequiredCents < 0 ||
      input.arrearsToleranceMonths < 0 ||
      input.paymentProofDeadlineMinutes <= 0
    ) {
      throw new DomainError('INVALID_SETTINGS', 'Los parámetros financieros contienen valores inválidos.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
      const data = {
        monthlyFeePerSqmCents,
        depositRequiredCents: input.depositRequiredCents,
        arrearsToleranceMonths: input.arrearsToleranceMonths,
        paymentProofDeadlineMinutes: input.paymentProofDeadlineMinutes,
        extraGuestDeclaredCents: input.extraGuestDeclaredCents,
        extraGuestUndeclaredCents: input.extraGuestUndeclaredCents,
        entryMarginMinutes: input.entryMarginMinutes,
        generalAdvanceHours: input.generalAdvanceHours,
        shortNoticeAdvanceMinutes: input.shortNoticeAdvanceMinutes,
        frequencyWeekStart: input.frequencyWeekStart ?? 'MONDAY',
        cancellationPolicy:
          input.cancellationPolicy !== undefined
            ? (input.cancellationPolicy as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      };
      const saved = before
        ? await tx.tenantSettings.update({ where: { id: before.id }, data })
        : await tx.tenantSettings.create({
            data: { id: generateUuidV7(), tenantId: ctx.tenantId, ...data },
          });

      await this.recordAudit(tx, ctx, 'SETTINGS_UPDATED', 'TenantSettings', saved.id, before, saved);
      return saved;
    });
  }

  async listUnitTypes(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.unitType.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { includedGuests: 'asc' } }),
    );
  }

  async upsertUnitType(
    ctx: TenantContext,
    input: { code: string; name: string; bedrooms?: number; includedGuests: number },
  ) {
    const bedrooms = input.bedrooms ?? 1;
    if (!Number.isInteger(input.includedGuests) || input.includedGuests < 0) {
      throw new DomainError('INVALID_UNIT_TYPE', 'Los invitados incluidos deben ser >= 0.', 422);
    }
    if (!Number.isInteger(bedrooms) || bedrooms < 0) {
      throw new DomainError('INVALID_UNIT_TYPE', 'Los dormitorios deben ser >= 0.', 422);
    }
    const code = input.code.trim().toUpperCase();
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.unitType.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code } },
      });
      const saved = before
        ? await tx.unitType.update({
            where: { id: before.id },
            data: { name: input.name.trim(), bedrooms, includedGuests: input.includedGuests },
          })
        : await tx.unitType.create({
            data: {
              id: generateUuidV7(),
              tenantId: ctx.tenantId,
              code,
              name: input.name.trim(),
              bedrooms,
              includedGuests: input.includedGuests,
            },
          });

      await this.recordAudit(tx, ctx, 'UNIT_TYPE_SAVED', 'UnitType', saved.id, before, saved);
      return saved;
    });
  }

  async deleteUnitType(ctx: TenantContext, id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unitType.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('UNIT_TYPE_NOT_FOUND', 'Tipología no encontrada.', 404);
      }
      const inUse = await tx.unit.count({ where: { tenantId: ctx.tenantId, unitTypeId: id } });
      if (inUse > 0) {
        throw new DomainError(
          'UNIT_TYPE_IN_USE',
          `No se puede eliminar porque ${inUse} unidad(es) usan esta tipología.`,
          409,
        );
      }
      await tx.unitType.delete({ where: { id } });
      await this.recordAudit(tx, ctx, 'UNIT_TYPE_DELETED', 'UnitType', id, existing, null);
      return { deleted: true };
    });
  }

  async listAmenities(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.amenity.findMany({
        where: { tenantId: ctx.tenantId },
        include: { accessRules: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async upsertAmenity(ctx: TenantContext, input: UpsertAmenityInput) {
    validateAmenityInput(input);
    const code = input.code.trim().toUpperCase();

    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.amenity.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code } },
      });
      const data = {
        name: input.name.trim(),
        capacity: input.capacity,
        maxDurationMinutes: input.maxDurationMinutes,
        schedule:
          input.schedule !== undefined && input.schedule !== null
            ? (input.schedule as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        frequency:
          input.frequency !== undefined && input.frequency !== null
            ? (input.frequency as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        mode: input.mode,
        advancePolicy: input.advancePolicy,
        appliesGuestQuota: input.appliesGuestQuota,
        requiresDeposit: input.requiresDeposit,
        cleaningFeeCents: input.cleaningFeeCents,
        hasReader: input.hasReader,
      };

      const saved = before
        ? await tx.amenity.update({ where: { id: before.id }, data })
        : await tx.amenity.create({
            data: { id: generateUuidV7(), tenantId: ctx.tenantId, code, ...data },
          });

      await this.recordAudit(tx, ctx, 'AMENITY_SAVED', 'Amenity', saved.id, before, saved);
      return saved;
    });
  }

  async deleteAmenity(ctx: TenantContext, id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.amenity.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('AMENITY_NOT_FOUND', 'Área comunal no encontrada.', 404);
      }
      const inReservations = await tx.reservationAmenity.count({
        where: { tenantId: ctx.tenantId, amenityId: id },
      });
      if (inReservations > 0) {
        throw new DomainError(
          'AMENITY_IN_USE',
          `No se puede eliminar porque tiene ${inReservations} reserva(s) asociada(s).`,
          409,
        );
      }
      await tx.amenityAccessRule.deleteMany({ where: { tenantId: ctx.tenantId, amenityId: id } });
      await tx.amenity.delete({ where: { id } });
      await this.recordAudit(tx, ctx, 'AMENITY_DELETED', 'Amenity', id, existing, null);
      return { deleted: true };
    });
  }

  async setAccessRule(
    ctx: TenantContext,
    input: { amenityId: string; occupancyRole: OccupancyRole; allowed: boolean },
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const amenity = await tx.amenity.findFirst({
        where: { id: input.amenityId, tenantId: ctx.tenantId },
      });
      if (!amenity) {
        throw new DomainError('AMENITY_NOT_FOUND', 'Área comunal no encontrada.', 404);
      }

      const before = await tx.amenityAccessRule.findUnique({
        where: {
          tenantId_amenityId_occupancyRole: {
            tenantId: ctx.tenantId,
            amenityId: input.amenityId,
            occupancyRole: input.occupancyRole,
          },
        },
      });

      const saved = before
        ? await tx.amenityAccessRule.update({
            where: { id: before.id },
            data: { allowed: input.allowed },
          })
        : await tx.amenityAccessRule.create({
            data: {
              id: generateUuidV7(),
              tenantId: ctx.tenantId,
              amenityId: input.amenityId,
              occupancyRole: input.occupancyRole,
              allowed: input.allowed,
            },
          });

      await this.recordAudit(tx, ctx, 'ACCESS_RULE_UPDATED', 'AmenityAccessRule', saved.id, before, saved);
      return saved;
    });
  }

  async listCleaningCombos(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.cleaningCombo.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { feeCents: 'asc' } }),
    );
  }

  async createCleaningCombo(ctx: TenantContext, input: { amenityIds: string[]; feeCents: number }) {
    if (!Number.isInteger(input.feeCents) || input.feeCents <= 0) {
      throw new DomainError('INVALID_COMBO_FEE', 'La tarifa del combo debe ser mayor a 0.', 422);
    }
    const comboKey = buildComboKey(input.amenityIds);
    const sortedIds = comboKey.split('+');

    return this.prisma.withTenant(ctx, async (tx) => {
      const amenities = await tx.amenity.findMany({
        where: { tenantId: ctx.tenantId, id: { in: sortedIds } },
      });
      if (amenities.length !== sortedIds.length) {
        throw new DomainError('AMENITY_NOT_FOUND', 'Una o más áreas del combo no existen.', 404);
      }
      const withoutCleaning = amenities.find((a) => a.cleaningFeeCents <= 0);
      if (withoutCleaning) {
        throw new DomainError(
          'COMBO_REQUIRES_CLEANING_FEE',
          `El área "${withoutCleaning.name}" no tiene tarifa de limpieza y no puede incluirse en un combo.`,
          422,
        );
      }

      const duplicate = await tx.cleaningCombo.findUnique({
        where: { tenantId_comboKey: { tenantId: ctx.tenantId, comboKey } },
      });
      if (duplicate) {
        throw new DomainError(
          'DUPLICATE_COMBO',
          'Ya existe un combo con ese mismo conjunto de áreas.',
          409,
        );
      }

      const created = await tx.cleaningCombo.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          comboKey,
          amenityIds: sortedIds,
          feeCents: input.feeCents,
        },
      });
      await this.recordAudit(tx, ctx, 'CLEANING_COMBO_CREATED', 'CleaningCombo', created.id, null, created);
      return created;
    });
  }

  async deleteCleaningCombo(ctx: TenantContext, comboId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.cleaningCombo.findFirst({
        where: { id: comboId, tenantId: ctx.tenantId },
      });
      if (!existing) {
        throw new DomainError('COMBO_NOT_FOUND', 'Combo no encontrado.', 404);
      }
      await tx.cleaningCombo.delete({ where: { id: existing.id } });
      await this.recordAudit(tx, ctx, 'CLEANING_COMBO_DELETED', 'CleaningCombo', existing.id, existing, null);
      return { deleted: true };
    });
  }

  async getParkingConfig(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.parkingConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    );
  }

  async upsertParkingConfig(
    ctx: TenantContext,
    input: { spots: number; freeMinutes: number; overtimeFeeCentsPerHour: number; rounding?: string },
  ) {
    if (input.spots < 0 || input.freeMinutes < 0 || input.overtimeFeeCentsPerHour < 0) {
      throw new DomainError('INVALID_PARKING_CONFIG', 'Configuración de parqueaderos inválida.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.parkingConfig.findUnique({ where: { tenantId: ctx.tenantId } });
      const data = {
        spots: input.spots,
        freeMinutes: input.freeMinutes,
        overtimeFeeCentsPerHour: input.overtimeFeeCentsPerHour,
        rounding: input.rounding ?? 'CEIL_HOUR',
      };
      const saved = before
        ? await tx.parkingConfig.update({ where: { id: before.id }, data })
        : await tx.parkingConfig.create({
            data: { id: generateUuidV7(), tenantId: ctx.tenantId, ...data },
          });
      await this.recordAudit(tx, ctx, 'PARKING_CONFIG_UPDATED', 'ParkingConfig', saved.id, before, saved);
      return saved;
    });
  }
}
