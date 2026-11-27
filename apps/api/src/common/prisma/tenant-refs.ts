import { DomainError } from '@noah/domain';
import type { Prisma } from '@prisma/client';

/**
 * PostgreSQL does not apply RLS to foreign-key checks, so a client-supplied id from ANOTHER
 * tenant would be accepted by the FK (or by tables without FK). These helpers must run inside
 * `withTenant`: RLS hides other tenants' rows, so "not found" covers both missing and foreign ids.
 */
type Tx = Prisma.TransactionClient;

export async function assertUnitInTenant(tx: Tx, tenantId: string, unitId: string): Promise<void> {
  const found = await tx.unit.findFirst({ where: { id: unitId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError('UNIT_NOT_FOUND', 'Unidad no encontrada.', 404);
}

export async function assertPersonInTenant(tx: Tx, tenantId: string, personId: string): Promise<void> {
  const found = await tx.person.findFirst({ where: { id: personId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError('PERSON_NOT_FOUND', 'Persona no encontrada.', 404);
}

export async function assertUnitTypeInTenant(tx: Tx, tenantId: string, unitTypeId: string): Promise<void> {
  const found = await tx.unitType.findFirst({ where: { id: unitTypeId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError('UNIT_TYPE_NOT_FOUND', 'Tipología no encontrada.', 404);
}

export async function assertAmenitiesInTenant(tx: Tx, tenantId: string, amenityIds: string[]): Promise<void> {
  const unique = Array.from(new Set(amenityIds));
  if (unique.length === 0) return;
  const count = await tx.amenity.count({ where: { id: { in: unique }, tenantId } });
  if (count !== unique.length) throw new DomainError('AMENITY_NOT_FOUND', 'Área comunal no encontrada.', 404);
}

export async function assertReservationInTenant(
  tx: Tx,
  tenantId: string,
  reservationId: string,
): Promise<{ id: string; unitId: string | null; status: string }> {
  const found = await tx.reservation.findFirst({
    where: { id: reservationId, tenantId },
    select: { id: true, unitId: true, status: true },
  });
  if (!found) throw new DomainError('RESERVATION_NOT_FOUND', 'Reserva no encontrada.', 404);
  return found;
}

export async function assertTicketInTenant(tx: Tx, tenantId: string, ticketId: string): Promise<void> {
  const found = await tx.ticket.findFirst({ where: { id: ticketId, tenantId }, select: { id: true } });
  if (!found) throw new DomainError('TICKET_NOT_FOUND', 'Incidencia no encontrada.', 404);
}
