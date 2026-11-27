/**
 * R04 arrears: number of overdue MONTHLY_FEE entries not covered by available credit.
 *
 * Ledger entries tagged `RESERVATION:<id>` (cleaning, extra guests, their payments and
 * reversals) are netted per reservation first: a cleaning payment must not "pay" monthly fees.
 * Only untagged credits plus any surplus of a reservation (net < 0) cover monthly fees, oldest first.
 */
export interface ArrearsEntry {
  type: string;
  amountCents: number;
  dueDate: Date | null;
  reference?: string | null;
}

export const RESERVATION_REF_PREFIX = 'RESERVATION:';
export const reservationLedgerRef = (reservationId: string) => `${RESERVATION_REF_PREFIX}${reservationId}`;

export function computeArrearsMonths(entries: ArrearsEntry[], now: Date): number {
  const perReservation = new Map<string, number>();
  let credit = 0;
  for (const e of entries) {
    if (e.reference?.startsWith(RESERVATION_REF_PREFIX)) {
      perReservation.set(e.reference, (perReservation.get(e.reference) ?? 0) + e.amountCents);
    } else if (e.amountCents < 0) {
      credit += -e.amountCents;
    }
  }
  for (const net of perReservation.values()) {
    if (net < 0) credit += -net;
  }

  const overdueFees = entries
    .filter((e) => e.type === 'MONTHLY_FEE' && e.amountCents > 0 && e.dueDate && e.dueDate < now)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

  let unpaid = 0;
  for (const fee of overdueFees) {
    if (credit >= fee.amountCents) credit -= fee.amountCents;
    else unpaid++;
  }
  return unpaid;
}
