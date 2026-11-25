const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

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
  options: { method?: string; body?: unknown; token?: string; tenantId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.tenantId) {
    headers['x-tenant-id'] = options.tenantId;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

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
    }>('/auth/login', { method: 'POST', body }),

  setup2fa: (setupToken: string) =>
    apiFetch<{ secret: string; otpAuthUri: string; qrDataUrl: string }>('/auth/2fa/setup', {
      method: 'POST',
      token: setupToken,
    }),

  confirm2fa: (setupToken: string, code: string) =>
    apiFetch<{ recoveryCodes: string[]; accessToken: string; user: StaffProfile }>(
      '/auth/2fa/confirm',
      { method: 'POST', token: setupToken, body: { code } },
    ),

  forgotPassword: (email: string) =>
    apiFetch<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
    }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

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
