import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError, generateUuidV7, type TenantContext } from '@noah/domain';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccessService } from '../access/access.service.js';

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
    entries: Array<{ type: string; amountCents: number; dueDate: Date | null }>,
    now: Date,
  ): number {
    const overdueFees = entries
      .filter((e) => e.type === 'MONTHLY_FEE' && e.amountCents > 0 && e.dueDate && e.dueDate < now)
      .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

    let totalPaid = entries
      .filter((e) => e.amountCents < 0)
      .reduce((sum, e) => sum + Math.abs(e.amountCents), 0);

    let unpaidOverdueCount = 0;
    for (const fee of overdueFees) {
      if (totalPaid >= fee.amountCents) {
        totalPaid -= fee.amountCents;
      } else {
        unpaidOverdueCount++;
      }
    }
    return unpaidOverdueCount;
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
    return this.prisma.withTenant(ctx, async (tx) => {
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

  async generateMonthlyFees(ctx: TenantContext, billingMonth: string, dueDateIso: string) {
    const dueDate = new Date(dueDateIso);
    return this.prisma.withTenant(ctx, async (tx) => {
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
        created,
      });
      return { billingMonth, created };
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
      const nextBalance = Math.max(0, account.balanceCents + delta);

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
        data: { balanceCents: nextBalance },
      });

      await this.recordAudit(
        tx,
        ctx,
        `DEPOSIT_${input.type}`,
        'DepositAccount',
        account.id,
        { balanceCents: account.balanceCents },
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
    return this.prisma.withTenant(ctx, async (tx) => {
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

      const updatedProof = await tx.paymentProof.update({
        where: { id: proof.id },
        data: { status: 'APPROVED', reviewedBy: ctx.actorId, reviewedAt: now },
      });

      const paymentEntry = await tx.ledgerEntry.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          unitId: proof.unitId,
          type: 'PAYMENT',
          amountCents: -proof.amountCents,
          description: `Pago aprobado (${proof.bank} · Ref. ${proof.reference})`,
          reference: proof.reference,
        },
      });

      // Sequential receipt number per tenant
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

      if (proof.reservationId) {
        const resUpdate = await tx.reservation.updateMany({
          where: {
            id: proof.reservationId,
            tenantId: ctx.tenantId,
            status: { in: ['PENDING_PAYMENT', 'IN_REVIEW'] },
          },
          data: { status: 'CONFIRMED', holdExpiresAt: null },
        });
        if (resUpdate.count > 0 && this.accessService) {
          await this.accessService.issueCredentialForReservationInTx(tx, ctx, proof.reservationId, now);
        }
      }

      await this.recordAudit(
        tx,
        ctx,
        'PAYMENT_PROOF_APPROVED',
        'PaymentProof',
        proof.id,
        { status: 'PENDING' },
        { status: 'APPROVED', receiptCode, reservationId: proof.reservationId },
      );

      return { proof: updatedProof, paymentEntry, receipt };
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

      const updated = await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedBy: ctx.actorId,
          reviewedAt: now,
        },
      });

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
