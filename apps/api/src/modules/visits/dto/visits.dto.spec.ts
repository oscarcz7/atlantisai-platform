import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CheckInVisitDto,
  RegisterUndeclaredGuestsDto,
  RegisterVisitDto,
  parseSearchQuery,
} from './visits.dto.js';

const ID_A = '01936b2e-1234-7abc-8def-0123456789ab';
const ID_B = '01936b2e-5678-7abc-8def-0123456789ac';

async function errorsFor<T extends object>(cls: new () => T, payload: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload) as object);
  return errors.map((e) => e.property);
}

// Mirrors handleRegister() in apps/web/app/dashboard/garita/page.tsx
const webVisitPayload = {
  hostUnitId: ID_A,
  visitorName: 'Juan Pérez',
  nationalId: '1712345678',
  needsParking: true,
  expectedAt: '2026-11-26T15:00:00.000Z',
};

describe('RegisterVisitDto', () => {
  it('accepts the payload sent by the web app (with and without plate)', async () => {
    expect(await errorsFor(RegisterVisitDto, webVisitPayload)).toEqual([]);
    expect(await errorsFor(RegisterVisitDto, { ...webVisitPayload, plate: 'PBA-1234' })).toEqual([]);
  });

  it('rejects missing fields, non-boolean needsParking and invalid dates', async () => {
    const { nationalId: _n, ...noId } = webVisitPayload;
    expect(await errorsFor(RegisterVisitDto, noId)).toContain('nationalId');
    expect(await errorsFor(RegisterVisitDto, { ...webVisitPayload, needsParking: 'yes' })).toContain('needsParking');
    expect(await errorsFor(RegisterVisitDto, { ...webVisitPayload, expectedAt: 'hoy' })).toContain('expectedAt');
    expect(await errorsFor(RegisterVisitDto, { ...webVisitPayload, hostUnitId: 'abc' })).toContain('hostUnitId');
  });
});

describe('CheckInVisitDto', () => {
  it('accepts the empty body sent by the web app and a positive spot', async () => {
    expect(await errorsFor(CheckInVisitDto, {})).toEqual([]);
    expect(await errorsFor(CheckInVisitDto, { parkingSpot: 3 })).toEqual([]);
  });

  it('rejects non-positive or fractional spots', async () => {
    for (const parkingSpot of [0, -1, 1.5, '2']) {
      expect(await errorsFor(CheckInVisitDto, { parkingSpot })).toContain('parkingSpot');
    }
  });
});

describe('RegisterUndeclaredGuestsDto', () => {
  const ok = { unitId: ID_A, reservationId: ID_B, count: 2 };

  it('accepts a valid payload', async () => {
    expect(await errorsFor(RegisterUndeclaredGuestsDto, ok)).toEqual([]);
  });

  it('rejects negative or zero counts and bad ids', async () => {
    expect(await errorsFor(RegisterUndeclaredGuestsDto, { ...ok, count: -15 })).toContain('count');
    expect(await errorsFor(RegisterUndeclaredGuestsDto, { ...ok, count: 0 })).toContain('count');
    expect(await errorsFor(RegisterUndeclaredGuestsDto, { ...ok, reservationId: 'x' })).toContain('reservationId');
  });
});

describe('parseSearchQuery', () => {
  it('passes strings through and rejects arrays / oversized input', () => {
    expect(parseSearchQuery(undefined)).toBeUndefined();
    expect(parseSearchQuery('PBA')).toBe('PBA');
    expect(() => parseSearchQuery(['a', 'b'])).toThrow();
    expect(() => parseSearchQuery('x'.repeat(101))).toThrow();
  });
});
