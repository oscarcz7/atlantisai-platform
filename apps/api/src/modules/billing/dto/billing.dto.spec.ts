import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  GenerateMonthlyFeesDto,
  RecordDepositMovementDto,
  RejectPaymentProofDto,
  SubmitPaymentProofDto,
  parsePaymentProofStatus,
} from './billing.dto.js';

const ID_A = '01936b2e-1234-7abc-8def-0123456789ab';

async function errorsFor<T extends object>(cls: new () => T, payload: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload) as object);
  return errors.map((e) => e.property);
}

// Mirrors handleSubmitProof() in apps/web/app/dashboard/billing/page.tsx
const webProofPayload = {
  unitId: ID_A,
  fileKey: 'manual/REF-123.pdf',
  bank: 'Banco Pichincha',
  amountCents: 12500,
  transferDate: '2026-11-20T17:00:00.000Z',
  reference: 'REF-123',
};

describe('SubmitPaymentProofDto', () => {
  it('accepts the payload sent by the web app (with and without reservationId)', async () => {
    expect(await errorsFor(SubmitPaymentProofDto, webProofPayload)).toEqual([]);
    expect(await errorsFor(SubmitPaymentProofDto, { ...webProofPayload, reservationId: ID_A })).toEqual([]);
  });

  it('rejects non-positive or non-integer amounts', async () => {
    for (const amountCents of [-100, 0, 10.5, null, '100']) {
      expect(await errorsFor(SubmitPaymentProofDto, { ...webProofPayload, amountCents })).toContain('amountCents');
    }
  });

  it('rejects invalid dates, ids and empty strings', async () => {
    expect(await errorsFor(SubmitPaymentProofDto, { ...webProofPayload, transferDate: 'ayer' })).toContain(
      'transferDate',
    );
    expect(await errorsFor(SubmitPaymentProofDto, { ...webProofPayload, unitId: '123' })).toContain('unitId');
    expect(await errorsFor(SubmitPaymentProofDto, { ...webProofPayload, reference: '' })).toContain('reference');
  });
});

describe('GenerateMonthlyFeesDto', () => {
  it('accepts the payload sent by the web app', async () => {
    expect(
      await errorsFor(GenerateMonthlyFeesDto, {
        billingMonth: '2026-12',
        dueDate: new Date('2026-12-10T23:59:59-05:00').toISOString(),
      }),
    ).toEqual([]);
  });

  it('accepts an empty body (month and due date resolved by the server in the building timezone)', async () => {
    expect(await errorsFor(GenerateMonthlyFeesDto, {})).toEqual([]);
    expect(await errorsFor(GenerateMonthlyFeesDto, { billingMonth: '2026-12' })).toEqual([]);
  });

  it('rejects malformed months and dates', async () => {
    expect(await errorsFor(GenerateMonthlyFeesDto, { billingMonth: '2026-13', dueDate: '2026-12-10' })).toContain(
      'billingMonth',
    );
    expect(await errorsFor(GenerateMonthlyFeesDto, { billingMonth: '2026-12', dueDate: 'x' })).toContain('dueDate');
  });
});

describe('RecordDepositMovementDto', () => {
  const ok = { unitId: ID_A, type: 'DEDUCTION', amountCents: 5000, reason: 'Daño en salón' };

  it('accepts a valid movement', async () => {
    expect(await errorsFor(RecordDepositMovementDto, ok)).toEqual([]);
    expect(await errorsFor(RecordDepositMovementDto, { ...ok, evidenceKey: 'evidence/a.jpg' })).toEqual([]);
  });

  it('rejects negative amounts and unknown types', async () => {
    expect(await errorsFor(RecordDepositMovementDto, { ...ok, amountCents: -100 })).toContain('amountCents');
    expect(await errorsFor(RecordDepositMovementDto, { ...ok, type: 'GIFT' })).toContain('type');
  });
});

describe('RejectPaymentProofDto', () => {
  it('requires a string reason', async () => {
    expect(await errorsFor(RejectPaymentProofDto, { reason: 'Monto no coincide' })).toEqual([]);
    expect(await errorsFor(RejectPaymentProofDto, { reason: 42 })).toContain('reason');
  });
});

describe('parsePaymentProofStatus', () => {
  it('accepts known statuses and rejects others', () => {
    expect(parsePaymentProofStatus(undefined)).toBeUndefined();
    expect(parsePaymentProofStatus('PENDING')).toBe('PENDING');
    expect(() => parsePaymentProofStatus('DELETED')).toThrow();
  });
});
