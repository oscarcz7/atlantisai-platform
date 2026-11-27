import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError, generateUuidV7, type TenantContext } from '@noah/domain';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccessService } from '../access/access.service.js';
import { assertReservationInTenant, assertUnitInTenant } from '../../common/prisma/tenant-refs.js';
import { computeArrearsMonths, reservationLedgerRef } from './arrears.js';
import { ensureCleaningCharge } from './reservation-ledger.js';
import { resolveMonthlyFeePeriod, summarizeMonthlyBalance } from './monthly-fees.js';
import { monthKeyInZone, monthStartUtc, shiftMonthKey } from '../../common/time/zoned-time.js';

/** Sum of CLEANING charges (amount due before confirmation). Falls back to total if unknown. */
function upfrontCentsFromCharges(charges: unknown, totalCents: number): number {
  if (!Array.isArray(charges)) return totalCents;
  return charges.reduce<number>((sum, c) => {
    const item = c as { type?: unknown; amountCents?: unknown };
    return item.type === 'CLEANING' && typeof item.amountCents === 'number' ? sum + item.amountCents : sum;
  }, 0);
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AccessService) private readonly accessService?: AccessService,
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

  /**
   * Returns a unit's statement: entries, current balance (>0 = owes), overdue monthly fee count, and deposit balance.
   */
  async getUnitStatement(ctx: TenantContext, unitId: string, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [entries, deposit, settings] = await Promise.all([
        tx.ledgerEntry.findMany({
          where: { tenantId: ctx.tenantId, unitId },
          orderBy: { createdAt: 'desc' },
        }),
        tx.depositAccount.findUnique({
          where: { tenantId_unitId: { tenantId: ctx.tenantId, unitId } },
          include: { movements: { orderBy: { createdAt: 'desc' } } },
        }),
        tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);

      const balanceCents = entries.reduce((sum, e) => sum + e.amountCents, 0);
      const arrearsMonths = this.computeArrearsMonths(entries, now);
      const depositBalanceCents = deposit?.balanceCents ?? 0;

      return {
        unitId,
        balanceCents,
        arrearsMonths,
        depositBalanceCents,
        depositRequiredCents: settings?.depositRequiredCents ?? 0,
        entries,
        depositMovements: deposit?.movements ?? [],
      };
    });
  }

  computeArrearsMonths(
    entries: Array<{ type: string; amountCents: number; dueDate: Date | null; reference?: string | null }>,
    now: Date,
  ): number {
    return computeArrearsMonths(entries, now);
  }

  async addLedgerEntry(
    ctx: TenantContext,
    input: {
      unitId: string;
      type:
        | 'MONTHLY_FEE'
        | 'CLEANING'
        | 'EXTRA_GUEST'
        | 'PARKING_OVERTIME'
        | 'DAMAGE'
        | 'PAYMENT'
        | 'ADJUSTMENT';
      amountCents: number;
      description: string;
      reference?: string;
      dueDate?: string;
    },
  ) {
    // Sign convention: charges are positive, payments negative, adjustments either way.
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
      throw new DomainError('INVALID_AMOUNT', 'El monto debe ser un entero distinto de 0 (centavos).', 422);
    }
    if (input.type === 'PAYMENT' && input.amountCents > 0) {
      throw new DomainError('INVALID_AMOUNT_SIGN', 'Un pago debe registrarse con monto negativo.', 422);
    }
    if (input.type !== 'PAYMENT' && input.type !== 'ADJUSTMENT' && input.amountCents < 0) {
      throw new DomainError('INVALID_AMOUNT_SIGN', 'Un cargo debe registrarse con monto positivo.', 422);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.unitId);
      const entry = await tx.ledgerEntry.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          type: input.type,
          amountCents: input.amountCents,
          description: input.description,
          reference: input.reference,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        },
      });
      await this.recordAudit(tx, ctx, 'LEDGER_ENTRY_CREATED', 'LedgerEntry', entry.id, null, entry);
      return entry;
    });
  }

  /**
   * Generates the MONTHLY_FEE charge of every active unit for `billingMonth` (idempotent per unit/month).
   * When omitted, the month is the building's current month (tenant.timezone) and the due date is
   * `TenantSettings.monthlyFeeDueDay` of that month at 23:59:59 local time.
   */
  async generateMonthlyFees(
    ctx: TenantContext,
    input: { billingMonth?: string; dueDate?: string } = {},
    now: Date = new Date(),
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [tenant, settings] = await Promise.all([
        tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { timezone: true } }),
        tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);
      if (!tenant) {
        throw new DomainError('TENANT_NOT_FOUND', 'Edificio no encontrado.', 404);
      }
      const { billingMonth, dueDate } = resolveMonthlyFeePeriod({
        billingMonth: input.billingMonth,
        dueDate: input.dueDate,
        timeZone: tenant.timezone,
        dueDay: settings?.monthlyFeeDueDay,
        now,
      });

      // Serialize per (tenant, month): concurrent runs would both pass the "exists" check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`monthly-fees:${ctx.tenantId}:${billingMonth}`}))`;
      const units = await tx.unit.findMany({
        where: { tenantId: ctx.tenantId, isActive: true, monthlyFeeCents: { gt: 0 } },
      });
      let created = 0;
      for (const unit of units) {
        const ref = `MONTHLY_FEE:${billingMonth}:${unit.id}`;
        const exists = await tx.ledgerEntry.findFirst({
          where: { tenantId: ctx.tenantId, unitId: unit.id, reference: ref },
        });
        if (!exists) {
          await tx.ledgerEntry.create({
            data: {
              id: generateUuidV7(),
              tenantId: ctx.tenantId,
              unitId: unit.id,
              type: 'MONTHLY_FEE',
              amountCents: unit.monthlyFeeCents,
              description: `Alícuota mensual ${billingMonth}`,
              reference: ref,
              dueDate,
            },
          });
          created++;
        }
      }
      await this.recordAudit(tx, ctx, 'MONTHLY_FEES_GENERATED', 'Billing', ctx.tenantId, null, {
        billingMonth,
        dueDate: dueDate.toISOString(),
        created,
      });
      return { billingMonth, dueDate: dueDate.toISOString(), created };
    });
  }

  /**
   * Building balance for the last `months` months (building timezone): MONTHLY_FEE billed per billing
   * month vs PAYMENT collected per month of registration. Amounts in cents (collected is positive).
   */
  async getMonthlyBalance(ctx: TenantContext, months = 6, now: Date = new Date()) {
    const count = Math.min(24, Math.max(1, Math.trunc(months)));
    return this.prisma.withTenant(ctx, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { timezone: true } });
      if (!tenant) {
        throw new DomainError('TENANT_NOT_FOUND', 'Edificio no encontrado.', 404);
      }
      const currentMonth = monthKeyInZone(now, tenant.timezone);
      const monthKeys = Array.from({ length: count }, (_, i) => shiftMonthKey(currentMonth, i - (count - 1)));
      const from = monthStartUtc(monthKeys[0]!, tenant.timezone);
      const to = monthStartUtc(shiftMonthKey(currentMonth, 1), tenant.timezone);
      const [fees, payments] = await Promise.all([
        tx.ledgerEntry.findMany({
          where: {
            tenantId: ctx.tenantId,
            type: 'MONTHLY_FEE',
            OR: monthKeys.map((m) => ({ reference: { startsWith: `MONTHLY_FEE:${m}:` } })),
          },
          select: { type: true, amountCents: true, reference: true, dueDate: true, createdAt: true },
        }),
        tx.ledgerEntry.findMany({
          where: { tenantId: ctx.tenantId, type: 'PAYMENT', createdAt: { gte: from, lt: to } },
          select: { type: true, amountCents: true, reference: true, dueDate: true, createdAt: true },
        }),
      ]);
      return {
        timezone: tenant.timezone,
        months: summarizeMonthlyBalance([...fees, ...payments], monthKeys, tenant.timezone),
      };
    });
  }

  async recordDepositMovement(
    ctx: TenantContext,
    input: {
      unitId: string;
      type: 'DEPOSIT' | 'DEDUCTION' | 'REFUND';
      amountCents: number;
      reason: string;
      evidenceKey?: string;
    },
  ) {
    if (input.amountCents <= 0) {
      throw new DomainError('INVALID_AMOUNT', 'El monto debe ser mayor a 0.', 422);
    }
    if (!input.reason.trim()) {
      throw new DomainError('REASON_REQUIRED', 'Debes indicar un motivo.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.unitId);
      let account = await tx.depositAccount.findUnique({
        where: { tenantId_unitId: { tenantId: ctx.tenantId, unitId: input.unitId } },
      });
      if (!account) {
        account = await tx.depositAccount.create({
          data: {
            id: generateUuidV7(),
            tenantId: ctx.tenantId,
            unitId: input.unitId,
            balanceCents: 0,
          },
        });
      }

      const delta = input.type === 'DEPOSIT' ? input.amountCents : -input.amountCents;
      // Lock the account row so concurrent movements cannot lose updates.
      await tx.$queryRaw`SELECT id FROM deposit_accounts WHERE id = ${account.id}::uuid FOR UPDATE`;
      const locked = await tx.depositAccount.findUniqueOrThrow({ where: { id: account.id } });
      if (locked.balanceCents + delta < 0) {
        // Never clamp silently: balance must always equal the sum of movements.
        throw new DomainError(
          'DEPOSIT_INSUFFICIENT_BALANCE',
          `El movimiento excede el saldo de la garantía (saldo actual: ${locked.balanceCents} centavos).`,
          422,
        );
      }

      const movement = await tx.depositMovement.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          depositAccountId: account.id,
          type: input.type,
          amountCents: input.amountCents,
          reason: input.reason.trim(),
          evidenceKey: input.evidenceKey,
        },
      });

      const updated = await tx.depositAccount.update({
        where: { id: account.id },
        data: { balanceCents: { increment: delta } },
      });

      await this.recordAudit(
        tx,
        ctx,
        `DEPOSIT_${input.type}`,
        'DepositAccount',
        account.id,
        { balanceCents: locked.balanceCents },
        { balanceCents: updated.balanceCents, reason: input.reason },
      );

      return { account: updated, movement };
    });
  }

  async listPaymentProofs(ctx: TenantContext, status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.paymentProof.findMany({
        where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async submitPaymentProof(
    ctx: TenantContext,
    input: {
      unitId: string;
      reservationId?: string;
      fileKey: string;
      bank: string;
      amountCents: number;
      transferDate: string;
      reference: string;
      extractedBy?: 'HUMAN' | 'AI';
    },
  ) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new DomainError('INVALID_AMOUNT', 'El monto del comprobante debe ser mayor a 0.', 422);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      await assertUnitInTenant(tx, ctx.tenantId, input.unitId);
      if (input.reservationId) {
        const reservation = await assertReservationInTenant(tx, ctx.tenantId, input.reservationId);
        if (reservation.unitId !== input.unitId) {
          throw new DomainError('PAYMENT_PROOF_UNIT_MISMATCH', 'La reserva no pertenece a esa unidad.', 409);
        }
      }
      const transferDate = new Date(input.transferDate);
      const duplicate = await tx.paymentProof.findFirst({
        where: {
          tenantId: ctx.tenantId,
          reference: input.reference.trim(),
          amountCents: input.amountCents,
          transferDate,
        },
      });

      const proof = await tx.paymentProof.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          reservationId: input.reservationId ?? null,
          fileKey: input.fileKey,
          bank: input.bank.trim(),
          amountCents: input.amountCents,
          transferDate,
          reference: input.reference.trim(),
          extractedBy: input.extractedBy ?? 'HUMAN',
          status: 'PENDING',
        },
      });

      if (input.reservationId) {
        await tx.reservation.updateMany({
          where: {
            id: input.reservationId,
            tenantId: ctx.tenantId,
            status: 'PENDING_PAYMENT',
          },
          data: { status: 'IN_REVIEW' },
        });
      }

      await this.recordAudit(tx, ctx, 'PAYMENT_PROOF_SUBMITTED', 'PaymentProof', proof.id, null, {
        amountCents: proof.amountCents,
        reference: proof.reference,
        possibleDuplicate: Boolean(duplicate),
      });

      return { proof, possibleDuplicate: Boolean(duplicate) };
    });
  }

  /**
   * Accountant approves a payment proof:
   * 1) Marks proof APPROVED
   * 2) Inserts LedgerEntry(PAYMENT)
   * 3) Emits sequential CollectionReceipt per tenant
   * 4) Confirms linked reservation (IN_REVIEW -> CONFIRMED)
   */
  async approvePaymentProof(ctx: TenantContext, proofId: string, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const proof = await tx.paymentProof.findFirst({
        where: { id: proofId, tenantId: ctx.tenantId },
      });
      if (!proof) {
        throw new DomainError('PAYMENT_PROOF_NOT_FOUND', 'Comprobante no encontrado.', 404);
      }
      if (proof.status !== 'PENDING') {
        throw new DomainError('PAYMENT_PROOF_ALREADY_REVIEWED', 'Este comprobante ya fue revisado.', 409);
      }

      const linkedReservation = proof.reservationId
        ? await tx.reservation.findFirst({
            where: { id: proof.reservationId, tenantId: ctx.tenantId },
            select: { id: true, unitId: true, totalCents: true, charges: true },
          })
        : null;
      if (proof.reservationId && !linkedReservation) {
        throw new DomainError('RESERVATION_NOT_FOUND', 'La reserva vinculada al comprobante no existe.', 404);
      }
      if (linkedReservation && linkedReservation.unitId !== proof.unitId) {
        throw new DomainError(
          'PAYMENT_PROOF_UNIT_MISMATCH',
          'El comprobante pertenece a una unidad distinta a la de la reserva.',
          409,
        );
      }

      // Atomic PENDING -> APPROVED: two accountants approving at once cannot both succeed.
      const transition = await tx.paymentProof.updateMany({
        where: { id: proof.id, tenantId: ctx.tenantId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: ctx.actorId, reviewedAt: now },
      });
      if (transition.count !== 1) {
        throw new DomainError('PAYMENT_PROOF_ALREADY_REVIEWED', 'Este comprobante ya fue revisado.', 409);
      }
      const updatedProof = await tx.paymentProof.findUniqueOrThrow({ where: { id: proof.id } });

      const paymentEntry = await tx.ledgerEntry.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          unitId: proof.unitId,
          type: 'PAYMENT',
          amountCents: -proof.amountCents,
          description: `Pago aprobado (${proof.bank} · Ref. ${proof.reference})`,
          // Reservation payments are tagged so they net against that reservation's charges
          // and never silently cover monthly fees (R04).
          reference: linkedReservation ? reservationLedgerRef(linkedReservation.id) : proof.reference,
        },
      });

      // Sequential receipt number per tenant (serialized per tenant within this transaction)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'receipt:' + ctx.tenantId}))`;
      const lastReceipt = await tx.collectionReceipt.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { sequenceNumber: 'desc' },
      });
      const nextSeq = (lastReceipt?.sequenceNumber ?? 0) + 1;
      const receiptCode = `REC-${String(nextSeq).padStart(6, '0')}`;

      const receipt = await tx.collectionReceipt.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          unitId: proof.unitId,
          sequenceNumber: nextSeq,
          receiptCode,
          amountCents: proof.amountCents,
          paymentProofId: proof.id,
          ledgerEntryIds: [paymentEntry.id],
          issuedAt: now,
        },
      });

      if (linkedReservation) {
        await ensureCleaningCharge(tx, {
          tenantId: ctx.tenantId,
          unitId: proof.unitId,
          reservationId: linkedReservation.id,
          cleaningCents: upfrontCentsFromCharges(linkedReservation.charges, linkedReservation.totalCents),
          now,
        });
      }

      // Only confirm the reservation once approved payments cover its total.
      let reservationConfirmed = false;
      let outstandingCents = 0;
      if (linkedReservation) {
        const paid = await tx.paymentProof.aggregate({
          where: { tenantId: ctx.tenantId, reservationId: linkedReservation.id, status: 'APPROVED' },
          _sum: { amountCents: true },
        });
        // C03: only the cleaning fee is paid upfront; extra guests (C01) go to the unit account.
        const upfrontCents = upfrontCentsFromCharges(linkedReservation.charges, linkedReservation.totalCents);
        outstandingCents = Math.max(0, upfrontCents - (paid._sum.amountCents ?? 0));
      }
      if (linkedReservation && outstandingCents === 0) {
        const resUpdate = await tx.reservation.updateMany({
          where: {
            id: linkedReservation.id,
            tenantId: ctx.tenantId,
            status: { in: ['PENDING_PAYMENT', 'IN_REVIEW'] },
          },
          data: { status: 'CONFIRMED', holdExpiresAt: null },
        });
        reservationConfirmed = resUpdate.count > 0;
        if (reservationConfirmed && this.accessService) {
          await this.accessService.issueCredentialForReservationInTx(tx, ctx, linkedReservation.id, now);
        }
      }

      await this.recordAudit(
        tx,
        ctx,
        'PAYMENT_PROOF_APPROVED',
        'PaymentProof',
        proof.id,
        { status: 'PENDING' },
        {
          status: 'APPROVED',
          receiptCode,
          reservationId: proof.reservationId,
          reservationConfirmed,
          outstandingCents,
        },
      );

      return { proof: updatedProof, paymentEntry, receipt, reservationConfirmed, outstandingCents };
    });
  }

  async rejectPaymentProof(
    ctx: TenantContext,
    proofId: string,
    reason: string,
    now: Date = new Date(),
  ) {
    if (!reason.trim()) {
      throw new DomainError('REJECTION_REASON_REQUIRED', 'Debes indicar el motivo del rechazo.', 422);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      const proof = await tx.paymentProof.findFirst({
        where: { id: proofId, tenantId: ctx.tenantId },
      });
      if (!proof) {
        throw new DomainError('PAYMENT_PROOF_NOT_FOUND', 'Comprobante no encontrado.', 404);
      }

      if (proof.status !== 'PENDING') {
        // An APPROVED proof already produced a PAYMENT entry and receipt; rejecting it would
        // leave the books inconsistent. Reversals must go through an explicit adjustment.
        throw new DomainError('PAYMENT_PROOF_ALREADY_REVIEWED', 'Este comprobante ya fue revisado.', 409);
      }
      const rejected = await tx.paymentProof.updateMany({
        where: { id: proof.id, tenantId: ctx.tenantId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedBy: ctx.actorId,
          reviewedAt: now,
        },
      });
      if (rejected.count !== 1) {
        throw new DomainError('PAYMENT_PROOF_ALREADY_REVIEWED', 'Este comprobante ya fue revisado.', 409);
      }
      const updated = await tx.paymentProof.findUniqueOrThrow({ where: { id: proof.id } });

      if (proof.reservationId) {
        await tx.reservation.updateMany({
          where: { id: proof.reservationId, tenantId: ctx.tenantId, status: 'IN_REVIEW' },
          data: { status: 'PENDING_PAYMENT' },
        });
      }

      await this.recordAudit(
        tx,
        ctx,
        'PAYMENT_PROOF_REJECTED',
        'PaymentProof',
        proof.id,
        { status: proof.status },
        { status: 'REJECTED', reason: reason.trim() },
      );

      return updated;
    });
  }
}
