import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CloneTenantDto, CreateTenantDto, ImportBuildingConfigDto, UpdateTenantDto } from './tenants.dto.js';

// Same options as the global ValidationPipe in main.ts.
async function errorsFor<T extends object>(cls: ClassConstructor<T>, payload: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const props: string[] = [];
  const walk = (errs: typeof errors, prefix = '') => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) props.push(path);
      if (e.children?.length) walk(e.children, path);
    }
  };
  walk(errors);
  return props;
}

const UUID_V7_A = '01936f3e-7b2a-7c4d-8e5f-0a1b2c3d4e5f';

const seedPath = resolve(__dirname, '../../../../../../seed/noah.config.json');
const loadSeed = (): Record<string, any> => JSON.parse(readFileSync(seedPath, 'utf8'));

// Payload mirrors apps/web/app/dashboard/buildings/page.tsx handleSaveBuilding
const buildingPayload = {
  name: 'Edificio NOAH',
  ruc: '1790012345001',
  timezone: 'America/Guayaquil',
  contacts: {
    administrator: { company: 'Grupo', contactName: 'Arq. X', phone: '+593984555922', email: 'a@b.com' },
    security: { company: 'FISSEG', whatsapp: '+593959846694' },
  },
  officeHours: {
    inPerson: { days: 'MON-FRI', open: '15:00', close: '17:00' },
    phoneWhatsapp: { days: 'MON-FRI', open: '09:00', close: '17:00' },
    weekends: 'Solo emergencias',
  },
  bankAccounts: [
    { bank: 'Pichincha', accountType: 'CORRIENTE', accountNumber: '123', holder: 'NOAH', rucOrId: '179', purpose: 'General' },
  ],
  adminUserIds: [UUID_V7_A],
};

describe('Tenants DTOs', () => {
  it('CreateTenantDto / UpdateTenantDto accept the buildings page payload (free-form nested JSON)', async () => {
    expect(await errorsFor(CreateTenantDto, { code: 'noah', ...buildingPayload })).toEqual([]);
    expect(await errorsFor(UpdateTenantDto, buildingPayload)).toEqual([]);
    const { adminUserIds: _a, ruc: _r, ...nonSuperAdmin } = buildingPayload;
    expect(await errorsFor(UpdateTenantDto, { ...nonSuperAdmin, bankAccounts: [] })).toEqual([]);
  });

  it('rejects invalid tenant payloads', async () => {
    expect(await errorsFor(CreateTenantDto, buildingPayload)).toContain('code');
    expect(await errorsFor(UpdateTenantDto, { code: 'other' })).toContain('code');
    expect(await errorsFor(UpdateTenantDto, { timezone: 'Mars/Olympus' })).toContain('timezone');
    expect(await errorsFor(UpdateTenantDto, { contacts: 'x' })).toContain('contacts');
    expect(await errorsFor(UpdateTenantDto, { contacts: null })).toContain('contacts');
    expect(await errorsFor(UpdateTenantDto, { bankAccounts: ['x'] })).toContain('bankAccounts');
    expect(await errorsFor(UpdateTenantDto, { adminUserIds: ['nope'] })).toContain('adminUserIds');
    expect(await errorsFor(UpdateTenantDto, { adminUserIds: [UUID_V7_A, UUID_V7_A] })).toContain('adminUserIds');
  });

  it('CloneTenantDto', async () => {
    expect(await errorsFor(CloneTenantDto, { code: 'noah-2', name: 'NOAH 2' })).toEqual([]);
    expect(await errorsFor(CloneTenantDto, { code: '', name: 'NOAH 2' })).toContain('code');
  });

  it('ImportBuildingConfigDto accepts seed/noah.config.json as-is (incl. _comment)', async () => {
    expect(await errorsFor(ImportBuildingConfigDto, loadSeed())).toEqual([]);
  });

  it('ImportBuildingConfigDto accepts tenant bankAccounts and missing optional blocks', async () => {
    const seed = loadSeed();
    seed['tenant'].bankAccounts = [{ bank: 'Pichincha', accountNumber: '1' }];
    delete seed['_comment'];
    delete seed['settings'].cancellationPolicy;
    expect(await errorsFor(ImportBuildingConfigDto, seed)).toEqual([]);
  });

  it('ImportBuildingConfigDto rejects broken configs', async () => {
    const missing = loadSeed();
    delete missing['parking'];
    expect(await errorsFor(ImportBuildingConfigDto, missing)).toContain('parking');

    const negative = loadSeed();
    negative['settings'].depositRequiredCents = -1;
    expect(await errorsFor(ImportBuildingConfigDto, negative)).toContain('settings.depositRequiredCents');

    const badRole = loadSeed();
    badRole['amenities'][0].allowedRoles = ['ROOT'];
    expect(await errorsFor(ImportBuildingConfigDto, badRole)).toContain('amenities.0.allowedRoles');

    const badCombo = loadSeed();
    badCombo['cleaningCombos'][0].feeCents = 'cinco';
    expect(await errorsFor(ImportBuildingConfigDto, badCombo)).toContain('cleaningCombos.0.feeCents');

    const noTenantCode = loadSeed();
    delete noTenantCode['tenant'].code;
    expect(await errorsFor(ImportBuildingConfigDto, noTenantCode)).toContain('tenant.code');

    const unknownKey = loadSeed();
    unknownKey['amenities'][1].color = 'red';
    expect(await errorsFor(ImportBuildingConfigDto, unknownKey)).toContain('amenities.1.color');
  });
});
