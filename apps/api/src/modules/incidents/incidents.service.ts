import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type TenantContext } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class IncidentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(ctx: TenantContext, status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.ticket.findMany({
        where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
        include: { subscribers: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async create(
    ctx: TenantContext,
    input: {
      category: string;
      location: string;
      description: string;
      urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
      photos?: string[];
    },
    now: Date = new Date(),
  ) {
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    return this.prisma.withTenant(ctx, async (tx) => {
      const similar = await tx.ticket.findMany({
        where: {
          tenantId: ctx.tenantId,
          category: input.category.trim(),
          location: input.location.trim(),
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { gte: windowStart },
        },
        select: { id: true, status: true, createdAt: true },
      });

      const ticket = await tx.ticket.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          category: input.category.trim(),
          location: input.location.trim(),
          description: input.description.trim(),
          urgency: input.urgency ?? 'MEDIUM',
          status: 'OPEN',
          photos: input.photos ?? [],
          reportedBy: ctx.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'TICKET_CREATED',
          entity: 'Ticket',
          entityId: ticket.id,
          channel: ctx.channel,
          after: { category: ticket.category, location: ticket.location, urgency: ticket.urgency },
        },
      });

      return { ticket, possibleDuplicates: similar };
    });
  }

  async updateStatus(
    ctx: TenantContext,
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
    assignedTo?: string,
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.ticket.findFirst({ where: { id: ticketId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('TICKET_NOT_FOUND', 'Ticket no encontrado.', 404);
      }
      const updated = await tx.ticket.update({
        where: { id: ticketId },
        data: { status, ...(assignedTo !== undefined ? { assignedTo } : {}) },
      });
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'TICKET_STATUS_UPDATED',
          entity: 'Ticket',
          entityId: ticketId,
          channel: ctx.channel,
          before: { status: existing.status },
          after: { status },
        },
      });
      return updated;
    });
  }

  async subscribe(ctx: TenantContext, ticketId: string, personId: string) {
    return this.prisma.withTenant(ctx, async (tx) =>
      tx.ticketSubscriber.upsert({
        where: { ticketId_personId: { ticketId, personId } },
        update: {},
        create: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          ticketId,
          personId,
        },
      }),
    );
  }

  async remove(ctx: TenantContext, ticketId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.ticket.findFirst({ where: { id: ticketId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('TICKET_NOT_FOUND', 'Ticket no encontrado.', 404);
      }
      await tx.ticket.delete({ where: { id: ticketId } });
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'TICKET_DELETED',
          entity: 'Ticket',
          entityId: ticketId,
          channel: ctx.channel,
          before: { category: existing.category, location: existing.location, status: existing.status },
        },
      });
      return { deleted: true };
    });
  }
}
