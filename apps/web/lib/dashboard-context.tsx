'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, type StaffProfile } from './api/auth';
import {
  fetchWithSession,
  getStoredAccessToken,
  refreshAccessToken,
  setStoredAccessToken,
  subscribeAccessToken,
} from './api/session';

const TENANT_STORAGE_KEY = 'noah_tenant_id';

export interface DashboardContextValue {
  token: string;
  me: StaffProfile;
  tenantId: string;
  /** IANA timezone of the active building (tenant.timezone). */
  tenantTimezone: string;
  setTenantId: (id: string) => void;
  refreshMe: () => Promise<void>;
  apiFetch: <T>(
    path: string,
    options?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ) => Promise<T>;
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

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function readStoredTenant(): string | null {
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY) ?? sessionStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTenant(id: string) {
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, id);
    sessionStorage.setItem(TENANT_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [tenantId, setTenantIdState] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeAccessToken((next) => {
      setToken(next);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      let currentToken = getStoredAccessToken();
      if (!currentToken) {
        currentToken = await refreshAccessToken();
      }
      if (!currentToken) {
        if (active) router.replace('/login');
        return;
      }

      try {
        const profile = await authApi.me(currentToken);
        if (!active) return;
        const latestToken = getStoredAccessToken() ?? currentToken;
        setToken(latestToken);
        setMe(profile);
        const savedTenant = readStoredTenant();
        const validSaved = profile.tenants.some((t) => t.id === savedTenant) ? savedTenant : null;
        const activeId = validSaved ?? profile.tenants[0]?.id ?? '';
        setTenantIdState(activeId);
        if (activeId) writeStoredTenant(activeId);
      } catch {
        setStoredAccessToken(null);
        if (active) router.replace('/login');
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [router]);

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id);
    writeStoredTenant(id);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const profile = await authApi.me(token);
    setMe(profile);
    if (profile.tenants.length > 0 && !profile.tenants.some((t) => t.id === tenantId)) {
      const fallback = profile.tenants[0]!.id;
      setTenantIdState(fallback);
      writeStoredTenant(fallback);
    }
  }, [token, tenantId]);

  const apiFetch = useCallback(
    async <T,>(
      path: string,
      options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ): Promise<T> => {
      const activeToken = getStoredAccessToken() ?? token;
      if (!activeToken) throw new Error('Sesión no iniciada');
      const res = await fetchWithSession(path, {
        method: options.method ?? 'GET',
        token: activeToken,
        tenantId: tenantId || undefined,
        headers: options.headers,
        body: options.body,
      });
      if (res.status === 204) return undefined as T;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(String(data['message'] ?? 'Error al procesar la solicitud.'));
      }
      return data as T;
    },
    [token, tenantId],
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setStoredAccessToken(null);
    sessionStorage.removeItem(TENANT_STORAGE_KEY);
    localStorage.removeItem(TENANT_STORAGE_KEY);
    router.push('/login');
  }, [router]);

  const activeTenant = me?.tenants.find((t) => t.id === tenantId);
  // The API always returns tenant.timezone; the browser zone is only a fallback for stale sessions.
  const tenantTimezone = activeTenant?.timezone || browserTimeZone();

  if (!token || !me) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Cargando plataforma...
      </div>
    );
  }

  return (
    <DashboardContext.Provider value={{ token, me, tenantId, tenantTimezone, setTenantId, refreshMe, apiFetch, logout }}>
      {children}
    </DashboardContext.Provider>
  );
}
