import { fetchWithSession } from './session';

export interface CancellationPolicyDto {
  minHoursBefore?: number;
  cleaningFeeHandling?: 'NON_REFUNDABLE' | 'REFUNDABLE' | 'CREDIT';
}

export interface TenantSettingsDto {
  id: string;
  monthlyFeePerSqmCents: number;
  depositRequiredCents: number;
  arrearsToleranceMonths: number;
  paymentProofDeadlineMinutes: number;
  extraGuestDeclaredCents: number;
  extraGuestUndeclaredCents: number;
  entryMarginMinutes: number;
  generalAdvanceHours: number;
  shortNoticeAdvanceMinutes: number;
  frequencyWeekStart: string;
  /** Day of month (1-31, clamped to the month's last day) on which generated monthly fees are due. */
  monthlyFeeDueDay: number;
  cancellationPolicy?: CancellationPolicyDto | null;
}

export interface UnitTypeDto {
  id: string;
  code: string;
  name: string;
  bedrooms: number;
  includedGuests: number;
}

export interface AccessRuleDto {
  id: string;
  amenityId: string;
  occupancyRole: 'OWNER_RESIDENT' | 'OWNER_LANDLORD' | 'LONG_TERM_TENANT' | 'AIRBNB_HOST' | 'AIRBNB_GUEST';
  allowed: boolean;
}

export interface AmenityScheduleDto {
  all?: { open: string; close: string };
  [day: string]: { open: string; close: string } | undefined;
}

export interface AmenityFrequencyDto {
  period: 'DAY' | 'WEEK' | 'MONTH';
  max: number;
}

export interface AmenityDto {
  id: string;
  code: string;
  name: string;
  capacity: number;
  maxDurationMinutes: number;
  schedule: AmenityScheduleDto | null;
  frequency: AmenityFrequencyDto | null;
  mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
  advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
  appliesGuestQuota: boolean;
  requiresDeposit: boolean;
  cleaningFeeCents: number;
  hasReader: boolean;
  accessRules: AccessRuleDto[];
}

export interface UpsertAmenityPayload {
  code: string;
  name: string;
  capacity: number;
  maxDurationMinutes: number;
  schedule?: AmenityScheduleDto | null;
  frequency?: AmenityFrequencyDto | null;
  mode: 'SHARED' | 'EXCLUSIVE' | 'FREE_USE';
  advancePolicy: 'GENERAL' | 'SHORT_NOTICE_ALLOWED';
  appliesGuestQuota: boolean;
  requiresDeposit: boolean;
  cleaningFeeCents: number;
  hasReader: boolean;
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
  /** Minutes before the free window ends at which the guard console raises an alert. */
  alertMarginMinutes: number;
}

async function catalogFetch<T>(
  path: string,
  token: string,
  tenantId: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetchWithSession(path, {
    method: options.method ?? 'GET',
    token,
    tenantId,
    body: options.body,
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
  upsertUnitType: (
    token: string,
    tenantId: string,
    body: { code: string; name: string; bedrooms: number; includedGuests: number },
  ) => catalogFetch<UnitTypeDto>('/catalog/unit-types', token, tenantId, { method: 'POST', body }),
  deleteUnitType: (token: string, tenantId: string, id: string) =>
    catalogFetch<{ deleted: boolean }>(`/catalog/unit-types/${id}`, token, tenantId, { method: 'DELETE' }),
  listAmenities: (token: string, tenantId: string) =>
    catalogFetch<AmenityDto[]>('/catalog/amenities', token, tenantId),
  upsertAmenity: (token: string, tenantId: string, body: UpsertAmenityPayload) =>
    catalogFetch<AmenityDto>('/catalog/amenities', token, tenantId, { method: 'POST', body }),
  deleteAmenity: (token: string, tenantId: string, id: string) =>
    catalogFetch<{ deleted: boolean }>(`/catalog/amenities/${id}`, token, tenantId, { method: 'DELETE' }),
  setAccessRule: (
    token: string,
    tenantId: string,
    body: { amenityId: string; occupancyRole: AccessRuleDto['occupancyRole']; allowed: boolean },
  ) => catalogFetch<AccessRuleDto>('/catalog/access-matrix', token, tenantId, { method: 'PUT', body }),
  listCombos: (token: string, tenantId: string) =>
    catalogFetch<CleaningComboDto[]>('/catalog/cleaning-combos', token, tenantId),
  createCombo: (token: string, tenantId: string, body: { amenityIds: string[]; feeCents: number }) =>
    catalogFetch<CleaningComboDto>('/catalog/cleaning-combos', token, tenantId, { method: 'POST', body }),
  deleteCombo: (token: string, tenantId: string, id: string) =>
    catalogFetch<{ deleted: boolean }>(`/catalog/cleaning-combos/${id}`, token, tenantId, { method: 'DELETE' }),
  getParking: (token: string, tenantId: string) =>
    catalogFetch<ParkingConfigDto | null>('/catalog/parking', token, tenantId),
  saveParking: (
    token: string,
    tenantId: string,
    body: {
      spots: number;
      freeMinutes: number;
      overtimeFeeCentsPerHour: number;
      rounding?: string;
      alertMarginMinutes?: number;
    },
  ) => catalogFetch<ParkingConfigDto>('/catalog/parking', token, tenantId, { method: 'PUT', body }),
};
