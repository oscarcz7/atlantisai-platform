import { Inject, Injectable } from '@nestjs/common';
import {
  DomainError,
  generateUuidV7,
  maskNationalId,
  normalizeEcuadorPhone,
  type OccupancyRole,
  resolveEffectiveRole,
  type TenantContext,
} from '@noah/domain';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../auth/crypto/field-encryption.service.js';
import { assertPersonInTenant, assertUnitInTenant, assertUnitTypeInTenant } from '../../common/prisma/tenant-refs.js';

export interface ImportRowInput {
  unitNumber: string;
  floor: number;
  unitTypeCode: string;
  monthlyFeeCents?: number;
  personFullName: string;
  nationalId: string;
  waPhone: string;
  email?: string;
  role: OccupancyRole;
  validFrom: string;
  validTo?: string;
}

/**
 * Audit rows are readable by ACCOUNTANT/ADMIN and kept forever: never store encrypted/hashed
 * national IDs there, and mask contact data (constitution VIII).
 */
const AUDIT_DROP_KEYS = new Set(['nationalIdEnc', 'nationalIdHash']);
function maskContact(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (key === 'waPhone') return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : '****';
  if (key === 'email') {
    const [user = '', domain = ''] = value.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return value;
}
export function sanitizeAuditPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(sanitizeAuditPayload);
  if (payload instanceof Date) return payload.toISOString();
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (AUDIT_DROP_KEYS.has(k)) continue;
      out[k] = k === 'waPhone' || k === 'email' ? maskContact(k, v) : sanitizeAuditPayload(v);
    }
    return out;
  }
  return payload;
}

@Injectable()
export class CadastreService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FieldEncryptionService) private readonly encryption: FieldEncryptionService,
  ) {}

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
        before: before ? (sanitizeAuditPayload(before) as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: after ? (sanitizeAuditPayload(after) as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  async listUnits(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.unit.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          unitType: true,
          occupancies: { include: { person: { select: { id: true, fullName: true, waPhone: true } } } },
        },
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      }),
    );
  }

  async getUnitDetail(ctx: TenantContext, unitId: string, at: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, tenantId: ctx.tenantId },
        include: {
          unitType: true,
          occupancies: {
            include: {
              person: {
                select: {
                  id: true,
                  fullName: true,
                  nationalIdMask: true,
                  waPhone: true,
                  email: true,
                  consentAt: true,
                },
              },
            },
            orderBy: { validFrom: 'desc' },
          },
        },
      });
      if (!unit) {
        throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada.', 404);
      }

      const effectiveRoles = unit.occupancies.map((o) => ({
        occupancyId: o.id,
        personId: o.personId,
        declaredRole: o.role,
        effectiveRole: resolveEffectiveRole(o.personId, unit.occupancies, at),
      }));

      return { ...unit, effectiveRoles };
    });
  }

  async createUnit(
    ctx: TenantContext,
    input: {
      number: string;
      floor: number;
      unitTypeId: string;
      areaSqm?: number | null;
      bedrooms?: number;
      monthlyFeeCents?: number;
    },
  ) {
    if (input.monthlyFeeCents !== undefined && input.monthlyFeeCents < 0) {
      throw new DomainError('INVALID_MONTHLY_FEE', 'La alícuota no puede ser negativa.', 422);
    }
    if (input.areaSqm !== undefined && input.areaSqm !== null && input.areaSqm < 0) {
      throw new DomainError('INVALID_AREA', 'El metraje no puede ser negativo.', 422);
    }
    const number = input.number.trim().toUpperCase();
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unit.findUnique({
        where: { tenantId_number: { tenantId: ctx.tenantId, number } },
      });
      if (existing) {
        throw new DomainError('UNIT_ALREADY_EXISTS', `La unidad ${number} ya existe.`, 409);
      }

      const [unitType, settings] = await Promise.all([
        tx.unitType.findFirst({ where: { id: input.unitTypeId, tenantId: ctx.tenantId } }),
        tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);
      if (!unitType) {
        throw new DomainError('UNIT_TYPE_NOT_FOUND', 'Tipología de unidad no encontrada.', 404);
      }

      const areaSqm = input.areaSqm ?? null;
      const bedrooms = input.bedrooms ?? unitType.bedrooms ?? 1;
      const feePerSqm = settings?.monthlyFeePerSqmCents ?? 0;
      const monthlyFeeCents =
        input.monthlyFeeCents !== undefined
          ? input.monthlyFeeCents
          : areaSqm !== null && areaSqm > 0 && feePerSqm > 0
            ? Math.round(areaSqm * feePerSqm)
            : 0;

      const created = await tx.unit.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          number,
          floor: input.floor,
          unitTypeId: input.unitTypeId,
          areaSqm,
          bedrooms,
          monthlyFeeCents,
        },
      });
      await this.recordAudit(tx, ctx, 'UNIT_CREATED', 'Unit', created.id, null, created);
      return created;
    });
  }

  async updateUnit(
    ctx: TenantContext,
    unitId: string,
    input: {
      number?: string;
      floor?: number;
      unitTypeId?: string;
      areaSqm?: number | null;
      bedrooms?: number;
      monthlyFeeCents?: number;
      isActive?: boolean;
    },
  ) {
    if (input.monthlyFeeCents !== undefined && input.monthlyFeeCents < 0) {
      throw new DomainError('INVALID_MONTHLY_FEE', 'La alícuota no puede ser negativa.', 422);
    }
    if (input.areaSqm !== undefined && input.areaSqm !== null && input.areaSqm < 0) {
      throw new DomainError('INVALID_AREA', 'El metraje no puede ser negativo.', 422);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada.', 404);
      }
      if (input.unitTypeId !== undefined) {
        await assertUnitTypeInTenant(tx, ctx.tenantId, input.unitTypeId);
      }
      const nextArea = input.areaSqm !== undefined ? input.areaSqm : existing.areaSqm;
      let nextMonthlyFee = input.monthlyFeeCents;
      if (nextMonthlyFee === undefined && input.areaSqm !== undefined && nextArea !== null && nextArea > 0) {
        const settings = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
        if (settings && settings.monthlyFeePerSqmCents > 0) {
          nextMonthlyFee = Math.round(nextArea * settings.monthlyFeePerSqmCents);
        }
      }

      const updated = await tx.unit.update({
        where: { id: unitId },
        data: {
          ...(input.number !== undefined ? { number: input.number.trim().toUpperCase() } : {}),
          ...(input.floor !== undefined ? { floor: input.floor } : {}),
          ...(input.unitTypeId !== undefined ? { unitTypeId: input.unitTypeId } : {}),
          ...(input.areaSqm !== undefined ? { areaSqm: input.areaSqm } : {}),
          ...(input.bedrooms !== undefined ? { bedrooms: input.bedrooms } : {}),
          ...(nextMonthlyFee !== undefined ? { monthlyFeeCents: nextMonthlyFee } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.recordAudit(tx, ctx, 'UNIT_UPDATED', 'Unit', unitId, existing, updated);
      return updated;
    });
  }

  async deleteUnit(ctx: TenantContext, unitId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada.', 404);
      }
      const [reservationsCount, ledgerCount, visitsCount] = await Promise.all([
        tx.reservation.count({ where: { tenantId: ctx.tenantId, unitId } }),
        tx.ledgerEntry.count({ where: { tenantId: ctx.tenantId, unitId } }),
        tx.visit.count({ where: { tenantId: ctx.tenantId, hostUnitId: unitId } }),
      ]);
      if (reservationsCount > 0 || ledgerCount > 0 || visitsCount > 0) {
        const updated = await tx.unit.update({ where: { id: unitId }, data: { isActive: false } });
        await this.recordAudit(tx, ctx, 'UNIT_DEACTIVATED', 'Unit', unitId, existing, updated);
        return { deleted: false, deactivated: true, unit: updated };
      }
      await tx.occupancy.deleteMany({ where: { tenantId: ctx.tenantId, unitId } });
      await tx.unit.delete({ where: { id: unitId } });
      await this.recordAudit(tx, ctx, 'UNIT_DELETED', 'Unit', unitId, existing, null);
      return { deleted: true, deactivated: false };
    });
  }

  async deletePerson(ctx: TenantContext, personId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.person.findFirst({ where: { id: personId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('PERSON_NOT_FOUND', 'Persona no encontrada.', 404);
      }
      const reservationsCount = await tx.reservation.count({
        where: { tenantId: ctx.tenantId, personId },
      });
      if (reservationsCount > 0) {
        const updated = await tx.person.update({ where: { id: personId }, data: { isActive: false } });
        await this.recordAudit(tx, ctx, 'PERSON_DEACTIVATED', 'Person', personId, existing, updated);
        return { deleted: false, deactivated: true };
      }
      await tx.occupancy.deleteMany({ where: { tenantId: ctx.tenantId, personId } });
      await tx.person.delete({ where: { id: personId } });
      await this.recordAudit(tx, ctx, 'PERSON_DELETED', 'Person', personId, existing, null);
      return { deleted: true, deactivated: false };
    });
  }

  async deleteOccupancy(ctx: TenantContext, occupancyId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.occupancy.findFirst({
        where: { id: occupancyId, tenantId: ctx.tenantId },
      });
      if (!existing) {
        throw new DomainError('OCCUPANCY_NOT_FOUND', 'Ocupación no encontrada.', 404);
      }
      await tx.occupancy.delete({ where: { id: occupancyId } });
      await this.recordAudit(tx, ctx, 'OCCUPANCY_DELETED', 'Occupancy', occupancyId, existing, null);
      return { deleted: true };
    });
  }

  async listPersons(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.person.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { fullName: 'asc' },
      });
      return rows.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        nationalId: p.nationalIdMask,
        waPhone: p.waPhone,
        email: p.email,
        consentAt: p.consentAt,
        isActive: p.isActive,
      }));
    });
  }

  async createPerson(
    ctx: TenantContext,
    input: {
      fullName: string;
      nationalId: string;
      waPhone: string;
      email?: string;
      consentAt?: string;
    },
  ) {
    const waPhone = normalizeEcuadorPhone(input.waPhone);
    const cleanNationalId = input.nationalId.trim();
    if (cleanNationalId.length < 5) {
      throw new DomainError('INVALID_NATIONAL_ID', 'Cédula o pasaporte inválido.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const duplicatePhone = await tx.person.findUnique({
        where: { tenantId_waPhone: { tenantId: ctx.tenantId, waPhone } },
      });
      if (duplicatePhone) {
        throw new DomainError(
          'PHONE_ALREADY_ASSIGNED',
          'Ese número de WhatsApp ya está asignado a otra persona en este edificio.',
          409,
        );
      }

      const created = await tx.person.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          fullName: input.fullName.trim(),
          nationalIdEnc: this.encryption.encrypt(cleanNationalId),
          nationalIdHash: this.encryption.hashNationalId(cleanNationalId),
          nationalIdMask: maskNationalId(cleanNationalId),
          waPhone,
          email: input.email?.trim().toLowerCase(),
          consentAt: input.consentAt ? new Date(input.consentAt) : null,
        },
      });

      await this.recordAudit(tx, ctx, 'PERSON_CREATED', 'Person', created.id, null, {
        id: created.id,
        fullName: created.fullName,
        nationalIdMask: created.nationalIdMask,
        waPhone: created.waPhone,
      });

      return {
        id: created.id,
        fullName: created.fullName,
        nationalId: created.nationalIdMask,
        waPhone: created.waPhone,
        email: created.email,
        consentAt: created.consentAt,
        isActive: created.isActive,
      };
    });
  }

  async createOccupancy(
    ctx: TenantContext,
    input: {
      personId: string;
      unitId: string;
      role: OccupancyRole;
      validFrom: string;
      validTo?: string | null;
    },
  ) {
    const validFrom = new Date(input.validFrom);
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (validTo && validTo <= validFrom) {
      throw new DomainError(
        'INVALID_OCCUPANCY_DATES',
        'La fecha de fin debe ser posterior a la fecha de inicio.',
        422,
      );
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.unitId);
      await assertPersonInTenant(tx, ctx.tenantId, input.personId);
      const created = await tx.occupancy.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          personId: input.personId,
          unitId: input.unitId,
          role: input.role,
          validFrom,
          validTo,
        },
      });
      await this.recordAudit(tx, ctx, 'OCCUPANCY_CREATED', 'Occupancy', created.id, null, created);
      return created;
    });
  }

  async previewImport(ctx: TenantContext, rows: ImportRowInput[]) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const unitTypes = await tx.unitType.findMany({ where: { tenantId: ctx.tenantId } });
      const validCodes = new Set(unitTypes.map((ut) => ut.code));
      const seenPhones = new Set<string>();

      const results = rows.map((row, index) => {
        const errors: string[] = [];
        if (!row.unitNumber?.trim()) errors.push('Falta número de unidad');
        if (!validCodes.has(row.unitTypeCode?.trim().toUpperCase())) {
          errors.push(`Tipología desconocida: ${row.unitTypeCode}`);
        }
        if (!row.personFullName?.trim()) errors.push('Falta nombre de persona');
        if (!row.nationalId?.trim() || row.nationalId.trim().length < 5) {
          errors.push('Cédula inválida');
        }
        try {
          const phone = normalizeEcuadorPhone(row.waPhone);
          if (seenPhones.has(phone)) {
            errors.push(`Teléfono duplicado en el archivo: ${phone}`);
          }
          seenPhones.add(phone);
        } catch {
          errors.push(`Teléfono inválido: ${row.waPhone}`);
        }
        return { row: index + 1, valid: errors.length === 0, errors };
      });

      return {
        total: rows.length,
        validCount: results.filter((r) => r.valid).length,
        errorCount: results.filter((r) => !r.valid).length,
        rows: results,
      };
    });
  }

  async confirmImport(ctx: TenantContext, rows: ImportRowInput[]) {
    const preview = await this.previewImport(ctx, rows);
    if (preview.errorCount > 0) {
      throw new DomainError(
        'IMPORT_VALIDATION_FAILED',
        `La importación contiene ${preview.errorCount} filas con errores.`,
        422,
        { rows: preview.rows.filter((r) => !r.valid) },
      );
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const unitTypes = await tx.unitType.findMany({ where: { tenantId: ctx.tenantId } });
      const unitTypeByCode = new Map(unitTypes.map((ut) => [ut.code, ut.id]));
      let imported = 0;

      for (const row of rows) {
        const unitNumber = row.unitNumber.trim().toUpperCase();
        const unitTypeId = unitTypeByCode.get(row.unitTypeCode.trim().toUpperCase())!;
        const unit = await tx.unit.upsert({
          where: { tenantId_number: { tenantId: ctx.tenantId, number: unitNumber } },
          update: { floor: row.floor, unitTypeId, monthlyFeeCents: row.monthlyFeeCents ?? 0 },
          create: {
            id: generateUuidV7(),
            tenantId: ctx.tenantId,
            number: unitNumber,
            floor: row.floor,
            unitTypeId,
            monthlyFeeCents: row.monthlyFeeCents ?? 0,
          },
        });

        const waPhone = normalizeEcuadorPhone(row.waPhone);
        const cleanId = row.nationalId.trim();
        const person = await tx.person.upsert({
          where: { tenantId_waPhone: { tenantId: ctx.tenantId, waPhone } },
          update: { fullName: row.personFullName.trim(), email: row.email?.trim().toLowerCase() },
          create: {
            id: generateUuidV7(),
            tenantId: ctx.tenantId,
            fullName: row.personFullName.trim(),
            nationalIdEnc: this.encryption.encrypt(cleanId),
            nationalIdHash: this.encryption.hashNationalId(cleanId),
            nationalIdMask: maskNationalId(cleanId),
            waPhone,
            email: row.email?.trim().toLowerCase(),
          },
        });

        await tx.occupancy.create({
          data: {
            id: generateUuidV7(),
            tenantId: ctx.tenantId,
            personId: person.id,
            unitId: unit.id,
            role: row.role,
            validFrom: new Date(row.validFrom),
            validTo: row.validTo ? new Date(row.validTo) : null,
          },
        });
        imported++;
      }

      await this.recordAudit(tx, ctx, 'CADASTRE_IMPORTED', 'Cadastre', ctx.tenantId, null, {
        imported,
      });
      return { imported };
    });
  }
}
