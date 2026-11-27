import { DomainError } from '@noah/domain';
import { monthKeyInZone, monthlyFeeDueDate } from '../../common/time/zoned-time.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Resolves the billing month and due date of a monthly fee run.
 * - billingMonth defaults to the current month in the building's timezone.
 * - dueDate defaults to `dueDay` of that month at 23:59:59 local time (clamped to the month's last day).
 */
export function resolveMonthlyFeePeriod(input: {
  billingMonth?: string;
  dueDate?: string;
  timeZone: string;
  dueDay: number | null | undefined;
  now: Date;
}): { billingMonth: string; dueDate: Date } {
  const billingMonth = input.billingMonth ?? monthKeyInZone(input.now, input.timeZone);
  if (!MONTH_RE.test(billingMonth)) {
    throw new DomainError('INVALID_BILLING_MONTH', 'El mes de facturación debe tener formato AAAA-MM.', 422);
  }
  if (input.dueDate !== undefined) {
    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new DomainError('INVALID_DUE_DATE', 'La fecha de vencimiento no es válida.', 422);
    }
    return { billingMonth, dueDate };
  }
  if (input.dueDay === null || input.dueDay === undefined) {
    throw new DomainError(
      'SETTINGS_NOT_CONFIGURED',
      'Configura los parámetros financieros del edificio (día de vencimiento de la alícuota) antes de generar alícuotas.',
      422,
    );
  }
  return { billingMonth, dueDate: monthlyFeeDueDate(billingMonth, input.dueDay, input.timeZone) };
}

export interface BalanceEntry {
  type: string;
  amountCents: number;
  reference: string | null;
  dueDate: Date | null;
  createdAt: Date;
}

export interface MonthlyBalanceRow {
  month: string;
  billedCents: number;
  collectedCents: number;
}

/**
 * Groups ledger entries per month (building timezone): MONTHLY_FEE by its billing month (from the
 * `MONTHLY_FEE:YYYY-MM:unit` reference, falling back to the due date) and PAYMENT by registration date.
 */
export function summarizeMonthlyBalance(
  entries: BalanceEntry[],
  monthKeys: string[],
  timeZone: string,
): MonthlyBalanceRow[] {
  const rows = new Map<string, MonthlyBalanceRow>(
    monthKeys.map((m) => [m, { month: m, billedCents: 0, collectedCents: 0 }]),
  );
  for (const e of entries) {
    if (e.type === 'MONTHLY_FEE') {
      const fromRef = e.reference?.match(/^MONTHLY_FEE:(\d{4}-\d{2}):/)?.[1];
      const month = fromRef ?? monthKeyInZone(e.dueDate ?? e.createdAt, timeZone);
      const row = rows.get(month);
      if (row) row.billedCents += e.amountCents;
    } else if (e.type === 'PAYMENT') {
      const row = rows.get(monthKeyInZone(e.createdAt, timeZone));
      if (row) row.collectedCents += -e.amountCents;
    }
  }
  return monthKeys.map((m) => rows.get(m)!);
}
