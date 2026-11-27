import { fetchWithSession } from './session';

export interface StaffTenant {
  id: string;
  code: string;
  name: string;
}

export interface StaffProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'GUARD';
  totpEnabled: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
  tenants: StaffTenant[];
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function apiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    tenantId?: string;
    skipAuthRefresh?: boolean;
  } = {},
): Promise<T> {
  const res = await fetchWithSession(path, options);

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiClientError(
      String(data['code'] ?? 'API_ERROR'),
      String(data['message'] ?? 'Ocurrió un error inesperado.'),
      res.status,
    );
  }
  return data as T;
}

export const authApi = {
  login: (body: { email: string; password: string; totpCode?: string; recoveryCode?: string }) =>
    apiFetch<{
      requires2faSetup?: boolean;
      setupToken?: string;
      accessToken?: string;
      user?: StaffProfile;
    }>('/auth/login', { method: 'POST', body, skipAuthRefresh: true }),

  setup2fa: (setupToken: string) =>
    apiFetch<{ secret: string; otpAuthUri: string; qrDataUrl: string }>('/auth/2fa/setup', {
      method: 'POST',
      token: setupToken,
      skipAuthRefresh: true,
    }),

  confirm2fa: (setupToken: string, code: string) =>
    apiFetch<{ recoveryCodes: string[]; accessToken: string; user: StaffProfile }>(
      '/auth/2fa/confirm',
      { method: 'POST', token: setupToken, body: { code }, skipAuthRefresh: true },
    ),

  forgotPassword: (email: string) =>
    apiFetch<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      skipAuthRefresh: true,
    }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
      skipAuthRefresh: true,
    }),

  acceptInvite: (token: string, password: string) =>
    apiFetch<{ requires2faSetup: true; setupToken: string }>('/auth/accept-invite', {
      method: 'POST',
      body: { token, password },
      skipAuthRefresh: true,
    }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST', skipAuthRefresh: true }),

  me: (token: string) => apiFetch<StaffProfile>('/auth/me', { token }),

  listStaffUsers: (token: string) => apiFetch<StaffProfile[]>('/staff-users', { token }),

  inviteStaffUser: (
    token: string,
    body: {
      email: string;
      fullName: string;
      role: 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'GUARD';
      tenantIds: string[];
    },
  ) => apiFetch('/staff-users/invite', { method: 'POST', token, body }),

  updateStaffUser: (
    token: string,
    id: string,
    body: {
      fullName?: string;
      role?: 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'GUARD';
      isActive?: boolean;
      tenantIds?: string[];
    },
  ) => apiFetch<StaffProfile>(`/staff-users/${id}`, { method: 'PATCH', token, body }),

  deactivateStaffUser: (token: string, id: string) =>
    apiFetch<StaffProfile>(`/staff-users/${id}`, { method: 'DELETE', token }),

  deleteStaffUser: (token: string, id: string) =>
    apiFetch<{ deleted: boolean }>(`/staff-users/${id}?permanent=true`, { method: 'DELETE', token }),
};
