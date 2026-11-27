import { Inject, Injectable } from '@nestjs/common';
import { DomainError, generateUuidV7, type TenantContext } from '@noah/domain';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  generateEmployeeNo,
  generateNumericCardCode,
  signPassToken,
  verifyPassToken,
} from './pass-token.js';

export interface UpsertReaderInput {
  id?: string;
  code: string;
  name: string;
  serial?: string;
  model?: string;
  protocol?: 'http' | 'https';
  ip: string;
  port?: number;
  doorNo?: number;
  firmware?: string;
  amenityIds: string[];
}

export interface GatewayAckInput {
  ok: boolean;
  error?: string;
}

export interface GatewayHeartbeatInput {
  readers: Array<{
    readerId?: string;
    code?: string;
    online: boolean;
    firmware?: string;
  }>;
}

export interface GatewayEventInput {
  readerId?: string;
  readerCode?: string;
  employeeNo?: string;
  credentialCode?: string;
  result: 'GRANTED' | 'DENIED';
  occurredAt: string;
  rawPayload?: unknown;
}

function sanitizePhoneForWa(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/[^\d]/g, '');
}

function formatDateTimeEc(date: Date, timezone: string): { dateText: string; timeText: string } {
  const dateText = date.toLocaleDateString('es-EC', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeText = date.toLocaleTimeString('es-EC', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { dateText, timeText };
}

@Injectable()
export class AccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async resolveTenantId(tenantIdOrCode: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tenantIdOrCode,
    );
    const tenant = await this.prisma.tenant.findFirst({
      where: isUuid ? { id: tenantIdOrCode } : { code: tenantIdOrCode },
      select: { id: true },
    });
    if (!tenant) {
      throw new DomainError('TENANT_NOT_FOUND', 'Edificio no encontrado para el gateway.', 404);
    }
    return tenant.id;
  }

  /**
   * Issues a temporary QR credential for a CONFIRMED reservation inside an existing tenant transaction,
   * and enqueues UPSERT_CREDENTIAL commands for all Hikvision readers linked to its amenities.
   */
  async issueCredentialForReservationInTx(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    reservationId: string,
    now: Date = new Date(),
  ) {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, tenantId: ctx.tenantId },
      include: {
        amenities: { include: { amenity: true } },
        person: { select: { fullName: true } },
        unit: { select: { number: true } },
        credentials: {
          where: { syncStatus: { in: ['PENDING', 'LOADED', 'ERROR'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!reservation) {
      throw new DomainError('RESERVATION_NOT_FOUND', 'Reserva no encontrada.', 404);
    }
    if (reservation.status !== 'CONFIRMED') {
      return null;
    }
    if (reservation.credentials.length > 0) {
      return reservation.credentials[0]!;
    }

    const settings = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    const entryMarginMinutes = settings?.entryMarginMinutes ?? 10;

    const validFrom = new Date(reservation.startsAt.getTime() - entryMarginMinutes * 60_000);
    const validTo = reservation.endsAt;

    const amenityIds = reservation.amenities.map((a) => a.amenityId);
    const readers =
      amenityIds.length > 0
        ? await tx.reader.findMany({
            where: {
              tenantId: ctx.tenantId,
              amenityIds: { hasSome: amenityIds },
            },
          })
        : [];

    const employeeNo = generateEmployeeNo();
    const code = generateNumericCardCode();
    const credentialId = generateUuidV7(now.getTime());

    const credential = await tx.credential.create({
      data: {
        id: credentialId,
        tenantId: ctx.tenantId,
        reservationId: reservation.id,
        employeeNo,
        code,
        readerIds: readers.map((r) => r.id),
        validFrom,
        validTo,
        syncStatus: 'PENDING',
      },
    });

    const holderName = reservation.unit
      ? `Depto ${reservation.unit.number}`
      : reservation.person?.fullName?.slice(0, 28) || 'Reserva NOAH';

    for (const reader of readers) {
      await tx.gatewayCommand.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          readerId: reader.id,
          credentialId: credential.id,
          idempotencyKey: `upsert:${credential.id}:${reader.id}`,
          type: 'UPSERT_CREDENTIAL',
          payload: {
            employeeNo: credential.employeeNo,
            cardNo: credential.code,
            name: holderName,
            validFrom: credential.validFrom.toISOString(),
            validTo: credential.validTo.toISOString(),
            doorNo: reader.doorNo,
          },
          status: 'PENDING',
        },
      });
    }

    await tx.auditLog.create({
      data: {
        id: generateUuidV7(now.getTime()),
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.actorId,
        action: 'CREDENTIAL_ISSUED',
        entity: 'Credential',
        entityId: credential.id,
        channel: ctx.channel,
        after: {
          reservationId: reservation.id,
          employeeNo: credential.employeeNo,
          readerCount: readers.length,
          validFrom: credential.validFrom.toISOString(),
          validTo: credential.validTo.toISOString(),
        },
      },
    });

    return credential;
  }

  /**
   * Revokes active credentials for a cancelled reservation and enqueues REVOKE_CREDENTIAL commands.
   */
  async revokeCredentialsForReservationInTx(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    reservationId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const credentials = await tx.credential.findMany({
      where: {
        tenantId: ctx.tenantId,
        reservationId,
        syncStatus: { in: ['PENDING', 'LOADED', 'ERROR'] },
      },
    });

    for (const cred of credentials) {
      const nextStatus = cred.readerIds.length > 0 ? 'REVOKE_PENDING' : 'REVOKED';
      await tx.credential.update({
        where: { id: cred.id },
        data: { syncStatus: nextStatus },
      });

      for (const readerId of cred.readerIds) {
        const key = `revoke:${cred.id}:${readerId}`;
        const existingCmd = await tx.gatewayCommand.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
        });
        if (!existingCmd) {
          await tx.gatewayCommand.create({
            data: {
              id: generateUuidV7(now.getTime()),
              tenantId: ctx.tenantId,
              readerId,
              credentialId: cred.id,
              idempotencyKey: key,
              type: 'REVOKE_CREDENTIAL',
              payload: {
                employeeNo: cred.employeeNo,
                cardNo: cred.code,
              },
              status: 'PENDING',
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'CREDENTIAL_REVOKED',
          entity: 'Credential',
          entityId: cred.id,
          channel: ctx.channel,
          before: { syncStatus: cred.syncStatus },
          after: { syncStatus: nextStatus, reservationId },
        },
      });
    }

    return credentials.length;
  }

  /**
   * Updates an existing reservation's active QR credential window and linked readers
   * when the reservation is edited, revoking removed readers and upserting current ones.
   */
  async syncUpdatedReservationCredentialInTx(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    reservationId: string,
    now: Date = new Date(),
  ) {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, tenantId: ctx.tenantId },
      include: {
        amenities: true,
        unit: { select: { number: true } },
        person: { select: { fullName: true } },
        credentials: {
          where: { syncStatus: { in: ['PENDING', 'LOADED', 'ERROR'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') return null;

    const existingCred = reservation.credentials[0];
    if (!existingCred) {
      return this.issueCredentialForReservationInTx(tx, ctx, reservationId, now);
    }

    const settings = await tx.tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    const entryMarginMinutes = settings?.entryMarginMinutes ?? 10;
    const validFrom = new Date(reservation.startsAt.getTime() - entryMarginMinutes * 60_000);
    const validTo = reservation.endsAt;

    const amenityIds = reservation.amenities.map((a) => a.amenityId);
    const readers =
      amenityIds.length > 0
        ? await tx.reader.findMany({
            where: { tenantId: ctx.tenantId, amenityIds: { hasSome: amenityIds } },
          })
        : [];
    const nextReaderIds = readers.map((r) => r.id);
    const removedReaderIds = existingCred.readerIds.filter((id) => !nextReaderIds.includes(id));

    const updatedCred = await tx.credential.update({
      where: { id: existingCred.id },
      data: {
        validFrom,
        validTo,
        readerIds: nextReaderIds,
        syncStatus: 'PENDING',
        lastError: null,
      },
    });

    for (const removedReaderId of removedReaderIds) {
      await tx.gatewayCommand.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          readerId: removedReaderId,
          credentialId: updatedCred.id,
          idempotencyKey: `revoke-edit:${updatedCred.id}:${removedReaderId}:${now.getTime()}`,
          type: 'REVOKE_CREDENTIAL',
          payload: {
            employeeNo: updatedCred.employeeNo,
            cardNo: updatedCred.code,
          },
          status: 'PENDING',
        },
      });
    }

    const holderName = reservation.unit
      ? `Depto ${reservation.unit.number}`
      : reservation.person?.fullName?.slice(0, 28) || 'Reserva NOAH';

    for (const reader of readers) {
      await tx.gatewayCommand.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          readerId: reader.id,
          credentialId: updatedCred.id,
          idempotencyKey: `upsert-edit:${updatedCred.id}:${reader.id}:${now.getTime()}`,
          type: 'UPSERT_CREDENTIAL',
          payload: {
            employeeNo: updatedCred.employeeNo,
            cardNo: updatedCred.code,
            name: holderName,
            validFrom: updatedCred.validFrom.toISOString(),
            validTo: updatedCred.validTo.toISOString(),
            doorNo: reader.doorNo,
          },
          status: 'PENDING',
        },
      });
    }

    return updatedCred;
  }

  /**
   * Returns the complete QR ticket payload for a confirmed reservation, including
   * QR image (PNG data URL), signed public pass link, and ready-to-send WhatsApp message/URL.
   */
  async getReservationTicket(ctx: TenantContext, reservationId: string) {
    const data = await this.prisma.withTenant(ctx, async (tx) => {
      const [tenant, reservation] = await Promise.all([
        tx.tenant.findUnique({ where: { id: ctx.tenantId } }),
        tx.reservation.findFirst({
          where: { id: reservationId, tenantId: ctx.tenantId },
          include: {
            unit: { select: { id: true, number: true } },
            person: { select: { id: true, fullName: true, waPhone: true } },
            amenities: { include: { amenity: { select: { id: true, code: true, name: true } } } },
            credentials: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }),
      ]);

      if (!tenant || !reservation) {
        throw new DomainError('RESERVATION_NOT_FOUND', 'Reserva no encontrada.', 404);
      }
      if (reservation.status !== 'CONFIRMED') {
        throw new DomainError(
          'RESERVATION_NOT_CONFIRMED',
          'Solo las reservas confirmadas tienen ticket QR disponible.',
          422,
        );
      }

      let credential = reservation.credentials[0] ?? null;
      if (!credential) {
        credential = await this.issueCredentialForReservationInTx(tx, ctx, reservation.id);
      }
      if (!credential) {
        throw new DomainError('CREDENTIAL_UNAVAILABLE', 'No se pudo generar la credencial QR.', 500);
      }

      const linkedReaders =
        credential.readerIds.length > 0
          ? await tx.reader.findMany({
              where: { tenantId: ctx.tenantId, id: { in: credential.readerIds } },
              select: { id: true, code: true, name: true, status: true, ip: true },
            })
          : [];

      return { tenant, reservation, credential, linkedReaders };
    });

    const qrDataUrl = await QRCode.toDataURL(data.credential.code, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: { dark: '#111827', light: '#FFFFFF' },
    });

    // Public pass stays readable until 2 hours after validTo (displays "Expirado" once validTo passes)
    const tokenExp = Math.floor(data.credential.validTo.getTime() / 1000) + 7200;
    const passToken = signPassToken({
      cid: data.credential.id,
      tid: ctx.tenantId,
      exp: tokenExp,
    });
    const publicWebUrl = (process.env['PUBLIC_WEB_URL'] || 'http://localhost:3000').replace(/\/$/, '');
    const passUrl = `${publicWebUrl}/passes/${passToken}`;

    const tz = data.tenant.timezone || 'America/Guayaquil';
    const startFmt = formatDateTimeEc(data.reservation.startsAt, tz);
    const endFmt = formatDateTimeEc(data.reservation.endsAt, tz);
    const validFromFmt = formatDateTimeEc(data.credential.validFrom, tz);
    const amenityNames = data.reservation.amenities.map((a) => a.amenity.name).join(' + ');
    const unitLabel = data.reservation.unit ? `Depto. ${data.reservation.unit.number}` : 'Administración';

    const whatsappLines = [
      `🎟️ *TICKET DE RESERVA — ${data.tenant.name.toUpperCase()}*`,
      ``,
      `📍 *Espacio:* ${amenityNames}`,
      `📅 *Fecha:* ${startFmt.dateText}`,
      `⏰ *Horario:* ${startFmt.timeText} – ${endFmt.timeText}`,
      `👥 *Personas:* ${data.reservation.declaredAttendees}`,
      `🏠 *Unidad:* ${unitLabel}${data.reservation.person ? ` (${data.reservation.person.fullName})` : ''}`,
      `🔑 *Acceso habilitado desde:* ${validFromFmt.timeText}`,
      `🆔 *Código QR:* ${data.credential.code}`,
      ``,
      `📲 *Abre tu pase con código QR aquí:*`,
      passUrl,
      ``,
      `_Presenta el código QR en la cámara del lector al ingresar._`,
    ];
    const whatsappMessage = whatsappLines.join('\n');
    const waPhone = sanitizePhoneForWa(data.reservation.person?.waPhone);
    const whatsappUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    return {
      reservationId: data.reservation.id,
      tenantName: data.tenant.name,
      timezone: tz,
      amenities: data.reservation.amenities.map((a) => a.amenity),
      unitNumber: data.reservation.unit?.number ?? null,
      personName: data.reservation.person?.fullName ?? null,
      personWaPhone: data.reservation.person?.waPhone ?? null,
      startsAt: data.reservation.startsAt.toISOString(),
      endsAt: data.reservation.endsAt.toISOString(),
      declaredAttendees: data.reservation.declaredAttendees,
      status: data.reservation.status,
      credential: {
        id: data.credential.id,
        employeeNo: data.credential.employeeNo,
        code: data.credential.code,
        validFrom: data.credential.validFrom.toISOString(),
        validTo: data.credential.validTo.toISOString(),
        syncStatus: data.credential.syncStatus,
        lastError: data.credential.lastError,
        syncedAt: data.credential.syncedAt?.toISOString() ?? null,
      },
      readers: data.linkedReaders,
      qrDataUrl,
      passToken,
      passUrl,
      whatsappMessage,
      whatsappUrl,
    };
  }

  /**
   * Public endpoint backing /passes/:token — verified via HMAC signature, returns zero PII.
   */
  async getPublicPass(token: string) {
    const payload = verifyPassToken(token);
    if (!payload) {
      throw new DomainError('INVALID_PASS_TOKEN', 'El enlace del pase no es válido o fue alterado.', 404);
    }

    const systemCtx: TenantContext = {
      tenantId: payload.tid,
      actorType: 'SYSTEM',
      actorId: 'public-pass',
      channel: 'SYSTEM',
    };

    const data = await this.prisma.withTenant(systemCtx, async (tx) => {
      const [tenant, credential] = await Promise.all([
        tx.tenant.findUnique({ where: { id: payload.tid }, select: { name: true, timezone: true } }),
        tx.credential.findFirst({
          where: { id: payload.cid, tenantId: payload.tid },
          include: {
            reservation: {
              include: {
                unit: { select: { number: true } },
                amenities: { include: { amenity: { select: { name: true, code: true } } } },
              },
            },
          },
        }),
      ]);
      if (!tenant || !credential || !credential.reservation) {
        throw new DomainError('PASS_NOT_FOUND', 'Pase digital no encontrado.', 404);
      }
      return { tenant, credential, reservation: credential.reservation };
    });

    const now = new Date();
    const isRevoked =
      data.credential.syncStatus === 'REVOKED' ||
      data.credential.syncStatus === 'REVOKE_PENDING' ||
      data.reservation.status === 'CANCELLED';
    const isExpired = now > data.credential.validTo;

    const qrDataUrl =
      !isRevoked && !isExpired
        ? await QRCode.toDataURL(data.credential.code, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 380,
            color: { dark: '#111827', light: '#FFFFFF' },
          })
        : null;

    return {
      tenantName: data.tenant.name,
      timezone: data.tenant.timezone || 'America/Guayaquil',
      amenities: data.reservation.amenities.map((a) => a.amenity.name),
      unitNumber: data.reservation.unit?.number ?? null,
      declaredAttendees: data.reservation.declaredAttendees,
      startsAt: data.reservation.startsAt.toISOString(),
      endsAt: data.reservation.endsAt.toISOString(),
      validFrom: data.credential.validFrom.toISOString(),
      validTo: data.credential.validTo.toISOString(),
      employeeNo: data.credential.employeeNo,
      code: isRevoked ? null : data.credential.code,
      syncStatus: data.credential.syncStatus,
      reservationStatus: data.reservation.status,
      isRevoked,
      isExpired,
      qrDataUrl,
    };
  }

  /**
   * Re-enqueues UPSERT_CREDENTIAL commands for a reservation's credential
   * (useful right after connecting a new Hikvision reader tomorrow).
   */
  async resyncReservationCredential(ctx: TenantContext, reservationId: string, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, tenantId: ctx.tenantId },
        include: {
          amenities: true,
          unit: { select: { number: true } },
          person: { select: { fullName: true } },
          credentials: {
            where: { syncStatus: { in: ['PENDING', 'LOADED', 'ERROR'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!reservation || reservation.status !== 'CONFIRMED') {
        throw new DomainError('RESERVATION_NOT_CONFIRMED', 'La reserva debe estar confirmada.', 422);
      }

      let credential = reservation.credentials[0] ?? null;
      if (!credential) {
        credential = await this.issueCredentialForReservationInTx(tx, ctx, reservationId, now);
      }
      if (!credential) {
        throw new DomainError('CREDENTIAL_UNAVAILABLE', 'No hay credencial para sincronizar.', 404);
      }

      const amenityIds = reservation.amenities.map((a) => a.amenityId);
      const readers = await tx.reader.findMany({
        where: { tenantId: ctx.tenantId, amenityIds: { hasSome: amenityIds } },
      });

      await tx.credential.update({
        where: { id: credential.id },
        data: {
          readerIds: readers.map((r) => r.id),
          syncStatus: 'PENDING',
          lastError: null,
        },
      });

      const holderName = reservation.unit
        ? `Depto ${reservation.unit.number}`
        : reservation.person?.fullName?.slice(0, 28) || 'Reserva NOAH';

      const queued: string[] = [];
      for (const reader of readers) {
        const cmd = await tx.gatewayCommand.create({
          data: {
            id: generateUuidV7(now.getTime()),
            tenantId: ctx.tenantId,
            readerId: reader.id,
            credentialId: credential.id,
            idempotencyKey: `resync:${credential.id}:${reader.id}:${now.getTime()}`,
            type: 'UPSERT_CREDENTIAL',
            payload: {
              employeeNo: credential.employeeNo,
              cardNo: credential.code,
              name: holderName,
              validFrom: credential.validFrom.toISOString(),
              validTo: credential.validTo.toISOString(),
              doorNo: reader.doorNo,
            },
            status: 'PENDING',
          },
        });
        queued.push(cmd.id);
      }

      return { credentialId: credential.id, readerCount: readers.length, commandIds: queued };
    });
  }

  // --- Readers CRUD & Remote Open ---

  async listReaders(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.reader.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { code: 'asc' },
      }),
    );
  }

  async upsertReader(ctx: TenantContext, input: UpsertReaderInput, now: Date = new Date()) {
    if (!input.code.trim() || !input.name.trim() || !input.ip.trim()) {
      throw new DomainError('INVALID_READER', 'Código, nombre e IP del lector son obligatorios.', 422);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const code = input.code.trim().toUpperCase();
      const existing = input.id
        ? await tx.reader.findFirst({ where: { id: input.id, tenantId: ctx.tenantId } })
        : await tx.reader.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code } } });

      const reader = existing
        ? await tx.reader.update({
            where: { id: existing.id },
            data: {
              code,
              name: input.name.trim(),
              serial: input.serial?.trim() || null,
              model: input.model?.trim() || 'DS-K1T344EBFWX-E1',
              protocol: input.protocol === 'https' ? 'https' : 'http',
              ip: input.ip.trim(),
              port: input.port ?? (input.protocol === 'https' ? 443 : 80),
              doorNo: input.doorNo ?? 1,
              firmware: input.firmware?.trim() || existing.firmware,
              amenityIds: Array.from(new Set(input.amenityIds)),
            },
          })
        : await tx.reader.create({
            data: {
              id: generateUuidV7(now.getTime()),
              tenantId: ctx.tenantId,
              code,
              name: input.name.trim(),
              serial: input.serial?.trim() || null,
              model: input.model?.trim() || 'DS-K1T344EBFWX-E1',
              protocol: input.protocol === 'https' ? 'https' : 'http',
              ip: input.ip.trim(),
              port: input.port ?? (input.protocol === 'https' ? 443 : 80),
              doorNo: input.doorNo ?? 1,
              firmware: input.firmware?.trim() || null,
              amenityIds: Array.from(new Set(input.amenityIds)),
            },
          });

      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: existing ? 'READER_UPDATED' : 'READER_CREATED',
          entity: 'Reader',
          entityId: reader.id,
          channel: ctx.channel,
          after: { code: reader.code, ip: reader.ip, doorNo: reader.doorNo, amenityIds: reader.amenityIds },
        },
      });

      return reader;
    });
  }

  async deleteReader(ctx: TenantContext, readerId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await tx.reader.findFirst({ where: { id: readerId, tenantId: ctx.tenantId } });
      if (!existing) {
        throw new DomainError('READER_NOT_FOUND', 'Lector no encontrado.', 404);
      }
      await tx.reader.delete({ where: { id: existing.id } });
      return { deleted: true };
    });
  }

  async triggerOpenDoor(ctx: TenantContext, readerId: string, reason: string, now: Date = new Date()) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const reader = await tx.reader.findFirst({ where: { id: readerId, tenantId: ctx.tenantId } });
      if (!reader) {
        throw new DomainError('READER_NOT_FOUND', 'Lector no encontrado.', 404);
      }
      const cmd = await tx.gatewayCommand.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          readerId: reader.id,
          idempotencyKey: `open:${reader.id}:${now.getTime()}`,
          type: 'OPEN_DOOR',
          payload: { doorNo: reader.doorNo, reason: reason || 'Apertura remota desde dashboard' },
          status: 'PENDING',
        },
      });
      await tx.auditLog.create({
        data: {
          id: generateUuidV7(now.getTime()),
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action: 'READER_REMOTE_OPEN',
          entity: 'Reader',
          entityId: reader.id,
          channel: ctx.channel,
          after: { commandId: cmd.id, reason },
        },
      });
      return cmd;
    });
  }

  async listGatewayCommands(ctx: TenantContext, limit = 50) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.gatewayCommand.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          reader: { select: { id: true, code: true, name: true, ip: true } },
          credential: { select: { id: true, employeeNo: true, code: true, syncStatus: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Math.max(1, limit)),
      }),
    );
  }

  async listAccessEvents(ctx: TenantContext, limit = 50) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.accessEvent.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          reader: { select: { id: true, code: true, name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: Math.min(200, Math.max(1, limit)),
      }),
    );
  }

  // --- Edge Gateway Machine-to-Machine Protocol ---

  async pullGatewayCommands(tenantIdOrCode: string, limit = 20) {
    const tenantId = await this.resolveTenantId(tenantIdOrCode);
    const ctx: TenantContext = {
      tenantId,
      actorType: 'SYSTEM',
      actorId: 'edge-gateway',
      channel: 'SYSTEM',
    };

    return this.prisma.withTenant(ctx, async (tx) => {
      const pending = await tx.gatewayCommand.findMany({
        where: { tenantId, status: 'PENDING' },
        include: {
          reader: {
            select: {
              id: true,
              code: true,
              name: true,
              protocol: true,
              ip: true,
              port: true,
              doorNo: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: Math.min(50, Math.max(1, limit)),
      });

      for (const cmd of pending) {
        await tx.gatewayCommand.update({
          where: { id: cmd.id },
          data: { status: 'PROCESSING', attempts: { increment: 1 } },
        });
      }

      return pending.map((cmd) => ({
        id: cmd.id,
        idempotencyKey: cmd.idempotencyKey,
        type: cmd.type,
        payload: cmd.payload,
        reader: cmd.reader,
        credentialId: cmd.credentialId,
      }));
    });
  }

  async ackGatewayCommand(
    tenantIdOrCode: string,
    commandId: string,
    input: GatewayAckInput,
    now: Date = new Date(),
  ) {
    const tenantId = await this.resolveTenantId(tenantIdOrCode);
    const ctx: TenantContext = {
      tenantId,
      actorType: 'SYSTEM',
      actorId: 'edge-gateway',
      channel: 'SYSTEM',
    };

    return this.prisma.withTenant(ctx, async (tx) => {
      const cmd = await tx.gatewayCommand.findFirst({ where: { id: commandId, tenantId } });
      if (!cmd) {
        throw new DomainError('COMMAND_NOT_FOUND', 'Comando no encontrado.', 404);
      }

      const updated = await tx.gatewayCommand.update({
        where: { id: cmd.id },
        data: {
          status: input.ok ? 'ACKED' : 'FAILED',
          lastError: input.ok ? null : input.error?.slice(0, 500) || 'Error desconocido en lector',
          ackedAt: now,
        },
      });

      if (cmd.credentialId) {
        const siblingCommands = await tx.gatewayCommand.findMany({
          where: { tenantId, credentialId: cmd.credentialId, type: cmd.type },
        });

        if (cmd.type === 'UPSERT_CREDENTIAL') {
          const anyFailed = siblingCommands.some((c) => c.status === 'FAILED');
          const allAcked = siblingCommands.every((c) => c.status === 'ACKED');
          await tx.credential.update({
            where: { id: cmd.credentialId },
            data: {
              syncStatus: allAcked ? 'LOADED' : anyFailed ? 'ERROR' : 'PENDING',
              lastError: anyFailed ? updated.lastError : null,
              syncedAt: allAcked ? now : undefined,
            },
          });
        } else if (cmd.type === 'REVOKE_CREDENTIAL') {
          const allAcked = siblingCommands.every((c) => c.status === 'ACKED');
          await tx.credential.update({
            where: { id: cmd.credentialId },
            data: {
              syncStatus: allAcked ? 'REVOKED' : 'REVOKE_PENDING',
              lastError: input.ok ? null : updated.lastError,
            },
          });
        }
      }

      return updated;
    });
  }

  async recordGatewayHeartbeat(
    tenantIdOrCode: string,
    input: GatewayHeartbeatInput,
    now: Date = new Date(),
  ) {
    const tenantId = await this.resolveTenantId(tenantIdOrCode);
    const ctx: TenantContext = {
      tenantId,
      actorType: 'SYSTEM',
      actorId: 'edge-gateway',
      channel: 'SYSTEM',
    };

    return this.prisma.withTenant(ctx, async (tx) => {
      let updatedCount = 0;
      for (const item of input.readers ?? []) {
        const reader = item.readerId
          ? await tx.reader.findFirst({ where: { id: item.readerId, tenantId } })
          : item.code
            ? await tx.reader.findUnique({ where: { tenantId_code: { tenantId, code: item.code } } })
            : null;
        if (!reader) continue;
        await tx.reader.update({
          where: { id: reader.id },
          data: {
            status: item.online ? 'ONLINE' : 'OFFLINE',
            firmware: item.firmware ?? reader.firmware,
            lastSeenAt: now,
          },
        });
        updatedCount++;
      }
      return { ok: true, updatedCount, serverTime: now.toISOString() };
    });
  }

  async ingestAccessEvents(
    tenantIdOrCode: string,
    events: GatewayEventInput[],
    now: Date = new Date(),
  ) {
    const tenantId = await this.resolveTenantId(tenantIdOrCode);
    const ctx: TenantContext = {
      tenantId,
      actorType: 'SYSTEM',
      actorId: 'edge-gateway',
      channel: 'SYSTEM',
    };

    return this.prisma.withTenant(ctx, async (tx) => {
      let inserted = 0;
      for (const ev of events) {
        const reader = ev.readerId
          ? await tx.reader.findFirst({ where: { id: ev.readerId, tenantId } })
          : ev.readerCode
            ? await tx.reader.findUnique({
                where: { tenantId_code: { tenantId, code: ev.readerCode } },
              })
            : null;

        const credential = ev.credentialCode
          ? await tx.credential.findUnique({
              where: { tenantId_code: { tenantId, code: ev.credentialCode } },
            })
          : ev.employeeNo
            ? await tx.credential.findUnique({
                where: { tenantId_employeeNo: { tenantId, employeeNo: ev.employeeNo } },
              })
            : null;

        await tx.accessEvent.create({
          data: {
            id: generateUuidV7(now.getTime()),
            tenantId,
            readerId: reader?.id ?? null,
            credentialId: credential?.id ?? null,
            employeeNo: ev.employeeNo ?? credential?.employeeNo ?? null,
            credentialCode: ev.credentialCode ?? credential?.code ?? null,
            result: ev.result === 'GRANTED' ? 'GRANTED' : 'DENIED',
            occurredAt: new Date(ev.occurredAt),
            rawPayload: (ev.rawPayload as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          },
        });
        inserted++;
      }
      return { inserted };
    });
  }
}
