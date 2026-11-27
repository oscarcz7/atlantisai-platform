import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateCleaningComboDto,
  SetAccessRuleDto,
  UpsertAmenityDto,
  UpsertParkingDto,
  UpsertSettingsDto,
  UpsertUnitTypeDto,
} from './catalog.dto.js';

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

// Payloads mirror apps/web/app/dashboard/config/page.tsx
const settingsPayload = {
  monthlyFeePerSqmCents: 500,
  depositRequiredCents: 20000,
  arrearsToleranceMonths: 2,
  extraGuestDeclaredCents: 500,
  extraGuestUndeclaredCents: 1000,
  paymentProofDeadlineMinutes: 240,
  entryMarginMinutes: 10,
  generalAdvanceHours: 24,
  shortNoticeAdvanceMinutes: 60,
  frequencyWeekStart: 'MONDAY',
  cancellationPolicy: { minHoursBefore: 24, cleaningFeeHandling: 'NON_REFUNDABLE' },
};

const amenityPayload = {
  code: 'BBQ',
  name: 'Área BBQ',
  capacity: 40,
  maxDurationMinutes: 360,
  mode: 'EXCLUSIVE',
  advancePolicy: 'GENERAL',
  schedule: { all: { open: '09:00', close: '23:00' } },
  frequency: { period: 'MONTH', max: 1 },
  appliesGuestQuota: false,
  requiresDeposit: true,
  cleaningFeeCents: 3500,
  hasReader: true,
};

describe('Catalog DTOs', () => {
  it('UpsertSettingsDto accepts the frontend payload and null policy', async () => {
    expect(await errorsFor(UpsertSettingsDto, settingsPayload)).toEqual([]);
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, cancellationPolicy: null })).toEqual([]);
    const { monthlyFeePerSqmCents: _m, frequencyWeekStart: _f, cancellationPolicy: _c, ...minimal } = settingsPayload;
    expect(await errorsFor(UpsertSettingsDto, minimal)).toEqual([]);
  });

  it('UpsertSettingsDto rejects negatives, floats, missing fields, bad enums and unknown keys', async () => {
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, depositRequiredCents: -1 })).toContain('depositRequiredCents');
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, extraGuestDeclaredCents: 1.5 })).toContain('extraGuestDeclaredCents');
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, paymentProofDeadlineMinutes: 0 })).toContain('paymentProofDeadlineMinutes');
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, entryMarginMinutes: '10' })).toContain('entryMarginMinutes');
    const { generalAdvanceHours: _g, ...missing } = settingsPayload;
    expect(await errorsFor(UpsertSettingsDto, missing)).toContain('generalAdvanceHours');
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, frequencyWeekStart: 'FUNDAY' })).toContain('frequencyWeekStart');
    expect(
      await errorsFor(UpsertSettingsDto, { ...settingsPayload, cancellationPolicy: { cleaningFeeHandling: 'X' } }),
    ).toContain('cancellationPolicy.cleaningFeeHandling');
    expect(await errorsFor(UpsertSettingsDto, { ...settingsPayload, id: 'x' })).toContain('id');
  });

  it('UpsertUnitTypeDto', async () => {
    expect(await errorsFor(UpsertUnitTypeDto, { code: '2D', name: 'Depto 2D', bedrooms: 2, includedGuests: 3 })).toEqual([]);
    expect(await errorsFor(UpsertUnitTypeDto, { code: 'SUITE', name: 'Suite', includedGuests: 3 })).toEqual([]);
    expect(await errorsFor(UpsertUnitTypeDto, { code: 'X', name: 'X', includedGuests: -1 })).toContain('includedGuests');
    expect(await errorsFor(UpsertUnitTypeDto, { name: 'X', includedGuests: 1 })).toContain('code');
  });

  it('UpsertAmenityDto accepts frontend payloads (with and without schedule/frequency)', async () => {
    expect(await errorsFor(UpsertAmenityDto, amenityPayload)).toEqual([]);
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, schedule: null, frequency: null })).toEqual([]);
  });

  it('UpsertAmenityDto rejects bad values', async () => {
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, capacity: 0 })).toContain('capacity');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, cleaningFeeCents: -100 })).toContain('cleaningFeeCents');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, mode: 'PRIVATE' })).toContain('mode');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, hasReader: 'yes' })).toContain('hasReader');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, schedule: { all: null } })).toContain('schedule');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, schedule: 'always' })).toContain('schedule');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, frequency: { period: 'YEAR', max: 1 } })).toContain('frequency.period');
    expect(await errorsFor(UpsertAmenityDto, { ...amenityPayload, frequency: { period: 'DAY', max: 0 } })).toContain('frequency.max');
  });

  it('SetAccessRuleDto accepts UUIDv7 and rejects bad ids/roles', async () => {
    expect(await errorsFor(SetAccessRuleDto, { amenityId: UUID_V7_A, occupancyRole: 'AIRBNB_GUEST', allowed: false })).toEqual([]);
    expect(await errorsFor(SetAccessRuleDto, { amenityId: 'abc', occupancyRole: 'AIRBNB_GUEST', allowed: true })).toContain('amenityId');
    expect(await errorsFor(SetAccessRuleDto, { amenityId: UUID_V7_A, occupancyRole: 'ADMIN', allowed: true })).toContain('occupancyRole');
  });

  it('CreateCleaningComboDto', async () => {
    expect(await errorsFor(CreateCleaningComboDto, { amenityIds: [UUID_V7_A, UUID_V7_B], feeCents: 5000 })).toEqual([]);
    expect(await errorsFor(CreateCleaningComboDto, { amenityIds: [UUID_V7_A, UUID_V7_A], feeCents: 5000 })).toContain('amenityIds');
    expect(await errorsFor(CreateCleaningComboDto, { amenityIds: ['x', UUID_V7_B], feeCents: 5000 })).toContain('amenityIds');
    expect(await errorsFor(CreateCleaningComboDto, { amenityIds: [UUID_V7_A, UUID_V7_B], feeCents: -5 })).toContain('feeCents');
  });

  it('UpsertParkingDto', async () => {
    expect(await errorsFor(UpsertParkingDto, { spots: 4, freeMinutes: 180, overtimeFeeCentsPerHour: 150, rounding: 'CEIL_HOUR' })).toEqual([]);
    expect(await errorsFor(UpsertParkingDto, { spots: 4, freeMinutes: 180, overtimeFeeCentsPerHour: 150, rounding: 'EXACT_MINUTE' })).toEqual([]);
    expect(await errorsFor(UpsertParkingDto, { spots: -1, freeMinutes: 180, overtimeFeeCentsPerHour: 150 })).toContain('spots');
    expect(await errorsFor(UpsertParkingDto, { spots: 4, freeMinutes: 180, overtimeFeeCentsPerHour: 150, rounding: 'FLOOR' })).toContain('rounding');
  });
});
