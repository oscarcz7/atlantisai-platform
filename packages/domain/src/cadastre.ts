import { DomainError } from './domain-utils.js';
import { type OccupancyRole } from './tenant-context.js';

export interface OccupancyRecord {
  readonly personId: string;
  readonly unitId: string;
  readonly role: OccupancyRole;
  readonly validFrom: Date;
  readonly validTo?: Date | null;
}

export function isOccupancyActiveAt(occupancy: OccupancyRecord, at: Date): boolean {
  const t = at.getTime();
  if (occupancy.validFrom.getTime() > t) {
    return false;
  }
  if (occupancy.validTo && occupancy.validTo.getTime() <= t) {
    return false;
  }
  return true;
}

/**
 * Resolves a person's effective occupancy role in a unit at timestamp `at`.
 * Rule (Manual §10): while a unit has an active LONG_TERM_TENANT, the owner
 * automatically resolves as OWNER_LANDLORD (no communal area access).
 */
export function resolveEffectiveRole(
  personId: string,
  unitOccupancies: OccupancyRecord[],
  at: Date,
): OccupancyRole | null {
  const activeUnitOccupancies = unitOccupancies.filter((o) => isOccupancyActiveAt(o, at));
  const personActive = activeUnitOccupancies.filter((o) => o.personId === personId);
  if (personActive.length === 0) {
    return null;
  }

  const hasActiveLongTermTenant = activeUnitOccupancies.some(
    (o) => o.role === 'LONG_TERM_TENANT',
  );

  // Prefer explicit non-owner active roles (e.g. LONG_TERM_TENANT, AIRBNB_GUEST)
  const primary = personActive[0]!;
  if (
    hasActiveLongTermTenant &&
    (primary.role === 'OWNER_RESIDENT' || primary.role === 'OWNER_LANDLORD')
  ) {
    return 'OWNER_LANDLORD';
  }

  return primary.role;
}

/**
 * Normalizes Ecuadorian or international phone numbers to E.164 (default country: EC +593).
 */
export function normalizeEcuadorPhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^09\d{8}$/.test(cleaned)) {
    return `+593${cleaned.slice(1)}`;
  }
  if (/^5939\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^9\d{8}$/.test(cleaned)) {
    return `+593${cleaned}`;
  }
  throw new DomainError(
    'INVALID_PHONE',
    `Teléfono inválido "${raw}". Usa formato ecuatoriano (09XXXXXXXX) o E.164 (+593...).`,
    422,
  );
}

/**
 * Masks a national ID / passport for safe display (e.g. "1712345678" -> "17****5678").
 */
export function maskNationalId(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= 4) {
    return '****';
  }
  if (clean.length <= 6) {
    return `${clean.slice(0, 1)}***${clean.slice(-2)}`;
  }
  // Only the last 4 digits: the first two (province) plus last four used to reveal 6 of 10.
  return `${'*'.repeat(clean.length - 4)}${clean.slice(-4)}`;
}
