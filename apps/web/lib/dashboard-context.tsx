'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, type StaffProfile } from './api/auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export interface DashboardContextValue {
  token: string;
  me: StaffProfile;
  tenantId: string;
  setTenantId: (id: string) => void;
  refreshMe: () => Promise<void>;
  apiFetch: <T>(path: string, options?: { method?: string; body?: unknown; headers?: Record<string, string> }) => Promise<T>;
  logout: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [tenantId, setTenantIdState] = useState('');

  useEffect(() => {
    const storedToken = sessionStorage.getItem('noah_access_token');
    if (!storedToken) {
      router.replace('/login');
      return;
    }
    authApi
      .me(storedToken)
      .then((profile) => {
        setToken(storedToken);
        setMe(profile);
        const savedTenant = sessionStorage.getItem('noah_tenant_id');
        const validSaved = profile.tenants.some((t) => t.id === savedTenant) ? savedTenant : null;
        const activeId = validSaved ?? profile.tenants[0]?.id ?? '';
        setTenantIdState(activeId);
        if (activeId) sessionStorage.setItem('noah_tenant_id', activeId);
      })
      .catch(() => {
        sessionStorage.removeItem('noah_access_token');
        router.replace('/login');
      });
  }, [router]);

  function setTenantId(id: string) {
    setTenantIdState(id);
    sessionStorage.setItem('noah_tenant_id', id);
  }

  async function refreshMe() {
    if (!token) return;
    const profile = await authApi.me(token);
    setMe(profile);
    if (!profile.tenants.some((t) => t.id === tenantId) && profile.tenants[0]) {
      setTenantId(profile.tenants[0].id);
    }
  }

  async function apiFetch<T>(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    if (!token) throw new Error('Sesión no iniciada');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      ...(options.headers ?? {}),
    };
    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(String(data['message'] ?? 'Error al procesar la solicitud.'));
    }
    return data as T;
  }

  async function logout() {
    await authApi.logout().catch(() => undefined);
    sessionStorage.removeItem('noah_access_token');
    sessionStorage.removeItem('noah_tenant_id');
    router.push('/login');
  }

  if (!token || !me) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Cargando plataforma...
      </div>
    );
  }

  return (
    <DashboardContext.Provider value={{ token, me, tenantId, setTenantId, refreshMe, apiFetch, logout }}>
      {children}
    </DashboardContext.Provider>
  );
}
