const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export interface TenantSettingsDto {
  id: string;
  depositRequiredCents: number;
  arrearsToleranceMonths: number;
  paymentProofDeadlineMinutes: number;
  extraGuestDeclaredCents: number;
  extraGuestUndeclaredCents: number;
  entryMarginMinutes: number;
  generalAdvanceHours: number;
  shortNoticeAdvanceMinutes: number;
  frequencyWeekStart: string;
}

export interface UnitTypeDto {
  id: string;
  code: string;
  name: string;
  includedGuests: number;
}

export interface AccessRuleDto {
  id: string;
  amenityId: string;
  occupancyRole: 'OWNER_RESIDENT' | 'OWNER_LANDLORD' | 'LONG_TERM_TENANT' | 'AIRBNB_HOST' | 'AIRBNB_GUEST';
  allowed: boolean;
}

export interface AmenityDto {
  id: string;
  code: string;
  name: string;
  capacity: number;
  maxDurationMinutes: number;
  mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
  advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
  appliesGuestQuota: boolean;
  requiresDeposit: boolean;
  cleaningFeeCents: number;
  hasReader: boolean;
  accessRules: AccessRuleDto[];
}

export interface CleaningComboDto {
  id: string;
  comboKey: string;
  amenityIds: string[];
  feeCents: number;
}

export interface ParkingConfigDto {
  id: string;
  spots: number;
  freeMinutes: number;
  overtimeFeeCentsPerHour: number;
  rounding: string;
}

async function catalogFetch<T>(
  path: string,
  token: string,
  tenantId: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data['message'] ?? 'Error al consultar la configuración.'));
  }
  return data as T;
}

export const catalogApi = {
  getSettings: (token: string, tenantId: string) =>
    catalogFetch<TenantSettingsDto | null>('/catalog/settings', token, tenantId),
  saveSettings: (token: string, tenantId: string, body: Omit<TenantSettingsDto, 'id'>) =>
    catalogFetch<TenantSettingsDto>('/catalog/settings', token, tenantId, { method: 'PUT', body }),
  listUnitTypes: (token: string, tenantId: string) =>
    catalogFetch<UnitTypeDto[]>('/catalog/unit-types', token, tenantId),
  listAmenities: (token: string, tenantId: string) =>
    catalogFetch<AmenityDto[]>('/catalog/amenities', token, tenantId),
  setAccessRule: (
    token: string,
    tenantId: string,
    body: { amenityId: string; occupancyRole: AccessRuleDto['occupancyRole']; allowed: boolean },
  ) => catalogFetch<AccessRuleDto>('/catalog/access-matrix', token, tenantId, { method: 'PUT', body }),
  listCombos: (token: string, tenantId: string) =>
    catalogFetch<CleaningComboDto[]>('/catalog/cleaning-combos', token, tenantId),
  getParking: (token: string, tenantId: string) =>
    catalogFetch<ParkingConfigDto | null>('/catalog/parking', token, tenantId),
};
