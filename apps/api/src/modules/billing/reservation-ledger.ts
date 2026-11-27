import { generateUuidV7 } from '@noah/domain';
import type { Prisma } from '@prisma/client';
import { reservationLedgerRef } from './arrears.js';

type Tx = Prisma.TransactionClient;
type Charge = { type?: unknown; amountCents?: unknown };

export function chargeCents(charges: unknown, type: 'CLEANING' | 'EXTRA_GUEST'): number {
  if (!Array.isArray(charges)) return 0;
  return (charges as Charge[]).reduce(
    (sum, c) => (c.type === type && typeof c.amountCents === 'number' ? sum + c.amountCents : sum),
    0,
  );
}

/**
 * P-12 (decided 2026-11-27): declared extra guests (C01) are charged to the unit account as a
 * pending balance; the reservation is still issued. Posts only the delta vs what is already on
 * the ledger for this reservation, so it is idempotent and handles edits/cancellations
 * (target 0 ⇒ full reversal).
 */
export async function syncExtraGuestCharge(
  tx: Tx,
  params: { tenantId: string; unitId: string; reservationId: string; targetCents: number; now: Date },
): Promise<number> {
  const reference = reservationLedgerRef(params.reservationId);
  const posted = await tx.ledgerEntry.aggregate({
    where: { tenantId: params.tenantId, unitId: params.unitId, reference, type: 'EXTRA_GUEST' },
    _sum: { amountCents: true },
  });
  const delta = params.targetCents - (posted._sum.amountCents ?? 0);
  if (delta === 0) return 0;
  await tx.ledgerEntry.create({
    data: {
      id: generateUuidV7(params.now.getTime()),
      tenantId: params.tenantId,
      unitId: params.unitId,
      type: 'EXTRA_GUEST',
      amountCents: delta,
      description:
        delta > 0
          ? 'Invitados extra declarados (reserva) — pendiente de pago'
          : 'Reverso de invitados extra (reserva modificada o cancelada)',
      reference,
    },
  });
  return delta;
}

/** Posts the reservation's CLEANING charge once (C03, non-refundable), netted with its payment. */
export async function ensureCleaningCharge(
  tx: Tx,
  params: { tenantId: string; unitId: string; reservationId: string; cleaningCents: number; now: Date },
): Promise<void> {
  if (params.cleaningCents <= 0) return;
  const reference = reservationLedgerRef(params.reservationId);
  const exists = await tx.ledgerEntry.findFirst({
    where: { tenantId: params.tenantId, unitId: params.unitId, reference, type: 'CLEANING' },
    select: { id: true },
  });
  if (exists) return;
  await tx.ledgerEntry.create({
    data: {
      id: generateUuidV7(params.now.getTime()),
      tenantId: params.tenantId,
      unitId: params.unitId,
      type: 'CLEANING',
      amountCents: params.cleaningCents,
      description: 'Limpieza de áreas comunales (reserva)',
      reference,
    },
  });
}
