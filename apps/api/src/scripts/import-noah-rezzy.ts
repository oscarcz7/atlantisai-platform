import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateUuidV7,
  maskNationalId,
  normalizeEcuadorPhone,
  type OccupancyRole,
  type TenantContext,
} from '@noah/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../modules/auth/crypto/field-encryption.service.js';
import {
  type BuildingConfigImportJson,
  TenantsService,
} from '../modules/tenants/tenants.service.js';

interface RezzyUnitInput {
  number: string;
  floor: number;
  unitTypeCode: string;
  bedrooms: number;
  areaSqm: number;
  owner: string;
  tenant: string | null;
}

interface RezzyPersonInput {
  fullName: string;
  nationalId: string;
  waPhone: string;
  email: string | null;
  notes?: string;
}

interface RezzyDataset {
  source: string;
  tenantCode: string;
  expectedTotals: {
    units: number;
    areaSqm: number;
    byType: Record<string, { count: number; areaSqm: number }>;
  };
  units: RezzyUnitInput[];
  persons: RezzyPersonInput[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateDataset(dataset: RezzyDataset, config: BuildingConfigImportJson) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (dataset.units.length !== dataset.expectedTotals.units) {
    errors.push(
      `Total unidades (${dataset.units.length}) != esperado (${dataset.expectedTotals.units})`,
    );
  }

  const unitNumbers = new Set<string>();
  const byType: Record<string, { count: number; areaSqm: number }> = {};
  let totalArea = 0;

  for (const u of dataset.units) {
    if (unitNumbers.has(u.number)) {
      errors.push(`Unidad duplicada: ${u.number}`);
    }
    unitNumbers.add(u.number);
    totalArea += u.areaSqm;
    byType[u.unitTypeCode] ??= { count: 0, areaSqm: 0 };
    byType[u.unitTypeCode]!.count += 1;
    byType[u.unitTypeCode]!.areaSqm += u.areaSqm;
  }

  if (Math.abs(round2(totalArea) - dataset.expectedTotals.areaSqm) > 0.001) {
    errors.push(
      `Suma total m² (${round2(totalArea)}) != esperado (${dataset.expectedTotals.areaSqm})`,
    );
  }

  for (const [typeCode, expected] of Object.entries(dataset.expectedTotals.byType)) {
    const actual = byType[typeCode] ?? { count: 0, areaSqm: 0 };
    if (actual.count !== expected.count) {
      errors.push(`Tipología ${typeCode}: cantidad ${actual.count} != ${expected.count}`);
    }
    if (Math.abs(round2(actual.areaSqm) - expected.areaSqm) > 0.001) {
      errors.push(
        `Tipología ${typeCode}: m² ${round2(actual.areaSqm)} != ${expected.areaSqm}`,
      );
    }
  }

  const configTypeCodes = new Set(config.unitTypes.map((t) => t.code));
  for (const typeCode of Object.keys(byType)) {
    if (!configTypeCodes.has(typeCode)) {
      errors.push(`Tipología ${typeCode} no existe en noah.config.json`);
    }
  }

  const personByName = new Map<string, RezzyPersonInput & { normalizedPhone: string }>();
  const phoneToName = new Map<string, string>();

  for (const p of dataset.persons) {
    if (personByName.has(p.fullName)) {
      errors.push(`Persona duplicada en JSON: ${p.fullName}`);
    }
    let normalizedPhone = '';
    try {
      normalizedPhone = normalizeEcuadorPhone(p.waPhone);
    } catch (err) {
      errors.push(`Teléfono inválido para ${p.fullName} (${p.waPhone}): ${String(err)}`);
    }
    if (normalizedPhone) {
      const existing = phoneToName.get(normalizedPhone);
      if (existing) {
        errors.push(`Teléfono duplicado ${normalizedPhone}: ${existing} y ${p.fullName}`);
      }
      phoneToName.set(normalizedPhone, p.fullName);
    }
    if (p.notes) {
      warnings.push(`${p.fullName}: ${p.notes}`);
    }
    personByName.set(p.fullName, { ...p, normalizedPhone });
  }

  const referencedPersons = new Set<string>();
  let rentedUnits = 0;

  for (const u of dataset.units) {
    if (!personByName.has(u.owner)) {
      errors.push(`Unidad ${u.number}: propietario "${u.owner}" no encontrado en persons`);
    } else {
      referencedPersons.add(u.owner);
    }
    if (u.tenant) {
      rentedUnits += 1;
      if (!personByName.has(u.tenant)) {
        errors.push(`Unidad ${u.number}: arrendatario "${u.tenant}" no encontrado en persons`);
      } else {
        referencedPersons.add(u.tenant);
      }
    }
  }

  for (const name of personByName.keys()) {
    if (!referencedPersons.has(name)) {
      warnings.push(`Persona sin unidad asignada: ${name}`);
    }
  }

  const feePerSqmCents = config.settings.monthlyFeePerSqmCents ?? 0;
  const totalMonthlyFeeCents = dataset.units.reduce(
    (sum, u) => sum + Math.round(u.areaSqm * feePerSqmCents),
    0,
  );

  return {
    errors,
    warnings,
    byType,
    totalArea: round2(totalArea),
    rentedUnits,
    totalOccupancies: dataset.units.length + rentedUnits,
    totalMonthlyFeeCents,
    personByName,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const configPath = resolve(process.cwd(), '../../seed/noah.config.json');
  const cadastrePath = resolve(process.cwd(), '../../seed/noah-rezzy-cadastre.json');

  const config = JSON.parse(readFileSync(configPath, 'utf8')) as BuildingConfigImportJson;
  const dataset = JSON.parse(readFileSync(cadastrePath, 'utf8')) as RezzyDataset;

  const check = validateDataset(dataset, config);

  process.stdout.write(`=== Validación de migración NOAH (Rezzy) ===\n`);
  process.stdout.write(`Modo: ${apply ? 'APPLY (escritura en BD)' : 'DRY-RUN (solo validación)'}\n`);
  process.stdout.write(`Unidades: ${dataset.units.length} (arrendadas: ${check.rentedUnits})\n`);
  process.stdout.write(`Personas: ${dataset.persons.length}\n`);
  process.stdout.write(`Ocupaciones a crear: ${check.totalOccupancies}\n`);
  process.stdout.write(`Área total: ${check.totalArea.toFixed(2)} m²\n`);
  process.stdout.write(
    `Tarifa base: $${((config.settings.monthlyFeePerSqmCents ?? 0) / 100).toFixed(2)} / m² → Recaudación mensual estimada: $${(check.totalMonthlyFeeCents / 100).toFixed(2)}\n`,
  );
  process.stdout.write(`Desglose por tipología:\n`);
  for (const [k, v] of Object.entries(check.byType)) {
    process.stdout.write(`  - ${k}: ${v.count} unidades (${round2(v.areaSqm).toFixed(2)} m²)\n`);
  }

  if (check.warnings.length > 0) {
    process.stdout.write(`\nAdvertencias (${check.warnings.length}):\n`);
    for (const w of check.warnings) {
      process.stdout.write(`  [!] ${w}\n`);
    }
  }

  if (check.errors.length > 0) {
    process.stderr.write(`\nERRORES (${check.errors.length}):\n`);
    for (const e of check.errors) {
      process.stderr.write(`  [X] ${e}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`\n✔ Validación matemática y referencial 100% limpia.\n`);

  if (!apply) {
    process.stdout.write(`Ejecuta con --apply para aplicar en la base de datos.\n`);
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const tenantsService = new TenantsService(prisma);
    const configSummary = await tenantsService.importConfig(config, 'rezzy-migration');
    process.stdout.write(
      `\n✔ Configuración aplicada (${configSummary.name}): ${configSummary.unitTypes} tipologías, ${configSummary.amenities} áreas, ${configSummary.cleaningCombos} combos.\n`,
    );

    const encryption = new FieldEncryptionService();
    const ctx: TenantContext = {
      tenantId: configSummary.tenantId,
      actorType: 'SYSTEM',
      actorId: 'rezzy-migration',
      channel: 'SYSTEM',
    };

    const feePerSqmCents = config.settings.monthlyFeePerSqmCents ?? 0;
    const validFrom = new Date('2026-01-01T00:00:00-05:00');

    const result = await prisma.withTenant(ctx, async (tx) => {
      const unitTypes = await tx.unitType.findMany({ where: { tenantId: ctx.tenantId } });
      const unitTypeByCode = new Map(unitTypes.map((ut) => [ut.code, ut.id]));

      // 1. Upsert persons
      const personIdByName = new Map<string, string>();
      let personsCreated = 0;
      let personsUpdated = 0;

      for (const p of check.personByName.values()) {
        const cleanId = p.nationalId.trim();
        const existing = await tx.person.findUnique({
          where: { tenantId_waPhone: { tenantId: ctx.tenantId, waPhone: p.normalizedPhone } },
        });
        if (existing) {
          await tx.person.update({
            where: { id: existing.id },
            data: {
              fullName: p.fullName,
              email: p.email ?? null,
              isActive: true,
            },
          });
          personIdByName.set(p.fullName, existing.id);
          personsUpdated += 1;
        } else {
          const id = generateUuidV7();
          await tx.person.create({
            data: {
              id,
              tenantId: ctx.tenantId,
              fullName: p.fullName,
              nationalIdEnc: encryption.encrypt(cleanId),
              nationalIdHash: encryption.hashNationalId(cleanId),
              nationalIdMask: maskNationalId(cleanId),
              waPhone: p.normalizedPhone,
              email: p.email ?? null,
              isActive: true,
            },
          });
          personIdByName.set(p.fullName, id);
          personsCreated += 1;
        }
      }

      // 2. Upsert units & occupancies
      let unitsCreated = 0;
      let unitsUpdated = 0;
      let occupanciesCreated = 0;

      for (const u of dataset.units) {
        const unitTypeId = unitTypeByCode.get(u.unitTypeCode);
        if (!unitTypeId) {
          throw new Error(`UnitType ${u.unitTypeCode} missing after config import`);
        }
        const monthlyFeeCents = Math.round(u.areaSqm * feePerSqmCents);

        const existingUnit = await tx.unit.findUnique({
          where: { tenantId_number: { tenantId: ctx.tenantId, number: u.number } },
        });

        let unitId: string;
        if (existingUnit) {
          await tx.unit.update({
            where: { id: existingUnit.id },
            data: {
              floor: u.floor,
              unitTypeId,
              areaSqm: u.areaSqm,
              bedrooms: u.bedrooms,
              monthlyFeeCents,
              isActive: true,
            },
          });
          unitId = existingUnit.id;
          unitsUpdated += 1;
        } else {
          unitId = generateUuidV7();
          await tx.unit.create({
            data: {
              id: unitId,
              tenantId: ctx.tenantId,
              number: u.number,
              floor: u.floor,
              unitTypeId,
              areaSqm: u.areaSqm,
              bedrooms: u.bedrooms,
              monthlyFeeCents,
              isActive: true,
            },
          });
          unitsCreated += 1;
        }

        const desiredOccupancies: Array<{ personId: string; role: OccupancyRole }> = [
          {
            personId: personIdByName.get(u.owner)!,
            role: u.tenant ? 'OWNER_LANDLORD' : 'OWNER_RESIDENT',
          },
        ];
        if (u.tenant) {
          desiredOccupancies.push({
            personId: personIdByName.get(u.tenant)!,
            role: 'LONG_TERM_TENANT',
          });
        }

        for (const occ of desiredOccupancies) {
          const exists = await tx.occupancy.findFirst({
            where: {
              tenantId: ctx.tenantId,
              unitId,
              personId: occ.personId,
              role: occ.role,
              validTo: null,
            },
          });
          if (!exists) {
            await tx.occupancy.create({
              data: {
                id: generateUuidV7(),
                tenantId: ctx.tenantId,
                unitId,
                personId: occ.personId,
                role: occ.role,
                validFrom,
                validTo: null,
              },
            });
            occupanciesCreated += 1;
          }
        }
      }

      const [dbUnits, dbPersons, dbOccupancies, dbAreaAgg] = await Promise.all([
        tx.unit.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
        tx.person.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
        tx.occupancy.count({ where: { tenantId: ctx.tenantId } }),
        tx.unit.aggregate({
          where: { tenantId: ctx.tenantId, isActive: true },
          _sum: { areaSqm: true, monthlyFeeCents: true },
        }),
      ]);

      return {
        personsCreated,
        personsUpdated,
        unitsCreated,
        unitsUpdated,
        occupanciesCreated,
        dbUnits,
        dbPersons,
        dbOccupancies,
        dbAreaSqm: round2(dbAreaAgg._sum.areaSqm ?? 0),
        dbMonthlyFeeCents: dbAreaAgg._sum.monthlyFeeCents ?? 0,
      };
    });

    process.stdout.write(`\n=== Resultado de migración en BD ===\n`);
    process.stdout.write(
      `Personas: ${result.personsCreated} creadas, ${result.personsUpdated} actualizadas (total activas en BD: ${result.dbPersons})\n`,
    );
    process.stdout.write(
      `Unidades: ${result.unitsCreated} creadas, ${result.unitsUpdated} actualizadas (total activas en BD: ${result.dbUnits})\n`,
    );
    process.stdout.write(
      `Ocupaciones: ${result.occupanciesCreated} creadas (total en BD: ${result.dbOccupancies})\n`,
    );
    process.stdout.write(
      `Cuadre BD: ${result.dbAreaSqm.toFixed(2)} m² | Alícuota mensual total: $${(result.dbMonthlyFeeCents / 100).toFixed(2)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
