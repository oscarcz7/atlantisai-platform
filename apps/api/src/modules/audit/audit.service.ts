import { Inject, Injectable } from '@nestjs/common';
import { type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLogs(
    ctx: TenantContext,
    filters: { action?: string; entity?: string; actorId?: string; limit?: number } = {},
  ) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.entity ? { entity: filters.entity } : {}),
          ...(filters.actorId ? { actorId: filters.actorId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit ?? 100, 500),
      }),
    );
  }

  async getOperationalReport(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [reservationsByStatus, ledgerByType, ticketsByCategory] = await Promise.all([
        tx.reservation.groupBy({
          by: ['status'],
          where: { tenantId: ctx.tenantId },
          _count: { _all: true },
        }),
        tx.ledgerEntry.groupBy({
          by: ['type'],
          where: { tenantId: ctx.tenantId },
          _sum: { amountCents: true },
          _count: { _all: true },
        }),
        tx.ticket.groupBy({
          by: ['category', 'status'],
          where: { tenantId: ctx.tenantId },
          _count: { _all: true },
        }),
      ]);

      return {
        reservationsByStatus: reservationsByStatus.map((r) => ({
          status: r.status,
          count: r._count._all,
        })),
        ledgerByType: ledgerByType.map((l) => ({
          type: l.type,
          count: l._count._all,
          totalCents: l._sum.amountCents ?? 0,
        })),
        ticketsByCategory: ticketsByCategory.map((t) => ({
          category: t.category,
          status: t.status,
          count: t._count._all,
        })),
      };
    });
  }
}
