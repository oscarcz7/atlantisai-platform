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
        before: before ? (before as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: after ? (after as Prisma.InputJsonValue) : Prisma.JsonNull,
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
    input: { number: string; floor: number; unitTypeId: string; monthlyFeeCents: number },
  ) {
    if (input.monthlyFeeCents < 0) {
      throw new DomainError('INVALID_MONTHLY_FEE', 'La alícuota no puede ser negativa.', 422);
    }
    const number = input.number.trim().toUpperCase();
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unit.findUnique({
        where: { tenantId_number: { tenantId: ctx.tenantId, number } },
      });
      if (existing) {
        throw new DomainError('UNIT_ALREADY_EXISTS', `La unidad ${number} ya existe.`, 409);
      }
      const created = await tx.unit.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          number,
          floor: input.floor,
          unitTypeId: input.unitTypeId,
          monthlyFeeCents: input.monthlyFeeCents,
        },
      });
      await this.recordAudit(tx, ctx, 'UNIT_CREATED', 'Unit', created.id, null, created);
      return created;
    });
  }

  async deactivateUnit(ctx: TenantContext, unitId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.unit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada.', 404);
      }
      const updated = await tx.unit.update({ where: { id: unitId }, data: { isActive: false } });
      await this.recordAudit(tx, ctx, 'UNIT_DEACTIVATED', 'Unit', unitId, existing, updated);
      return updated;
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
          nationalIdHash: this.encryption.hashToken(cleanNationalId),
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
            nationalIdHash: this.encryption.hashToken(cleanId),
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
