import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateOccupancyDto,
  CreatePersonDto,
  CreateUnitDto,
  ImportRowsDto,
  UpdateUnitDto,
} from './cadastre.dto.js';

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
const UUID_V7_B = '01936f3e-7b2a-7c4d-8e5f-0a1b2c3d4e60';

// Payloads mirror apps/web/app/dashboard/cadastre/page.tsx
const unitPayload = { number: '101', floor: 1, unitTypeId: UUID_V7_A, bedrooms: 2, areaSqm: 85.5, monthlyFeeCents: 42750 };

const importRow = {
  unitNumber: '101',
  floor: 1,
  unitTypeCode: 'SUITE',
  monthlyFeeCents: 10000,
  personFullName: 'Ana Pérez',
  nationalId: '0102030405',
  waPhone: '0991234567',
  email: 'ana@example.com',
  role: 'OWNER_RESIDENT',
  validFrom: '2026-01-01T05:00:00.000Z',
};

describe('Cadastre DTOs', () => {
  it('CreateUnitDto accepts frontend payloads (areaSqm null, no manual fee)', async () => {
    expect(await errorsFor(CreateUnitDto, unitPayload)).toEqual([]);
    const { monthlyFeeCents: _f, ...noFee } = unitPayload;
    expect(await errorsFor(CreateUnitDto, { ...noFee, areaSqm: null })).toEqual([]);
  });

  it('CreateUnitDto rejects missing/invalid fields', async () => {
    const { number: _n, ...noNumber } = unitPayload;
    expect(await errorsFor(CreateUnitDto, noNumber)).toContain('number');
    expect(await errorsFor(CreateUnitDto, { ...unitPayload, monthlyFeeCents: -1 })).toContain('monthlyFeeCents');
    expect(await errorsFor(CreateUnitDto, { ...unitPayload, areaSqm: -3 })).toContain('areaSqm');
    expect(await errorsFor(CreateUnitDto, { ...unitPayload, floor: 1.5 })).toContain('floor');
    expect(await errorsFor(CreateUnitDto, { ...unitPayload, unitTypeId: 'suite' })).toContain('unitTypeId');
    expect(await errorsFor(CreateUnitDto, { ...unitPayload, foo: 1 })).toContain('foo');
  });

  it('UpdateUnitDto accepts partial payloads, null area and isActive', async () => {
    expect(await errorsFor(UpdateUnitDto, { ...unitPayload, areaSqm: null })).toEqual([]);
    expect(await errorsFor(UpdateUnitDto, { isActive: false })).toEqual([]);
    expect(await errorsFor(UpdateUnitDto, {})).toEqual([]);
    expect(await errorsFor(UpdateUnitDto, { number: null })).toContain('number');
    expect(await errorsFor(UpdateUnitDto, { isActive: 'no' })).toContain('isActive');
  });

  it('CreatePersonDto', async () => {
    const person = { fullName: 'Ana Pérez', nationalId: '0102030405', waPhone: '0991234567' };
    expect(await errorsFor(CreatePersonDto, person)).toEqual([]);
    expect(await errorsFor(CreatePersonDto, { ...person, email: 'ana@example.com', consentAt: '2026-01-01T00:00:00Z' })).toEqual([]);
    expect(await errorsFor(CreatePersonDto, { ...person, email: 'not-an-email' })).toContain('email');
    expect(await errorsFor(CreatePersonDto, { fullName: 'Ana' })).toEqual(expect.arrayContaining(['nationalId', 'waPhone']));
    expect(await errorsFor(CreatePersonDto, { ...person, waPhone: 991234567 })).toContain('waPhone');
  });

  it('CreateOccupancyDto', async () => {
    const occ = {
      unitId: UUID_V7_A,
      personId: UUID_V7_B,
      role: 'LONG_TERM_TENANT',
      validFrom: new Date('2026-01-01T00:00:00-05:00').toISOString(),
    };
    expect(await errorsFor(CreateOccupancyDto, occ)).toEqual([]);
    expect(await errorsFor(CreateOccupancyDto, { ...occ, validTo: new Date('2026-12-31T23:59:59-05:00').toISOString() })).toEqual([]);
    expect(await errorsFor(CreateOccupancyDto, { ...occ, validTo: null })).toEqual([]);
    expect(await errorsFor(CreateOccupancyDto, { ...occ, validFrom: 'mañana' })).toContain('validFrom');
    expect(await errorsFor(CreateOccupancyDto, { ...occ, role: 'GUARD' })).toContain('role');
    expect(await errorsFor(CreateOccupancyDto, { ...occ, personId: '123' })).toContain('personId');
  });

  it('ImportRowsDto validates structure but leaves content errors to the preview', async () => {
    expect(await errorsFor(ImportRowsDto, { rows: [importRow] })).toEqual([]);
    expect(await errorsFor(ImportRowsDto, { rows: [] })).toEqual([]);
    // empty strings are reported per-row by previewImport, not rejected here
    expect(await errorsFor(ImportRowsDto, { rows: [{ ...importRow, waPhone: '', personFullName: '' }] })).toEqual([]);
    expect(await errorsFor(ImportRowsDto, {})).toContain('rows');
    expect(await errorsFor(ImportRowsDto, { rows: 'x' })).toContain('rows');
    expect(await errorsFor(ImportRowsDto, { rows: [{ ...importRow, floor: 'uno' }] })).toContain('rows.0.floor');
    expect(await errorsFor(ImportRowsDto, { rows: [{ ...importRow, role: 'X' }] })).toContain('rows.0.role');
    expect(await errorsFor(ImportRowsDto, { rows: [{ ...importRow, validFrom: undefined }] })).toContain('rows.0.validFrom');
    expect(await errorsFor(ImportRowsDto, { rows: [{ ...importRow, monthlyFeeCents: -1 }] })).toContain('rows.0.monthlyFeeCents');
  });
});
