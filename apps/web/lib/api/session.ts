const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
export const ACCESS_TOKEN_KEY = 'noah_access_token';

const DEFINITIVE_EXPIRED_CODES = new Set([
  'SESSION_IDLE_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_INVALID',
  'USER_INACTIVE',
]);

type TokenListener = (token: string | null) => void;
const listeners = new Set<TokenListener>();

let refreshInFlight: Promise<string | null> | null = null;
let redirectingToLogin = false;

export function subscribeAccessToken(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
  listeners.forEach((fn) => fn(token));
}

export function redirectToLoginExpired(reason: 'idle' | 'expired' = 'expired'): Promise<never> {
  setStoredAccessToken(null);
  if (typeof window !== 'undefined' && !redirectingToLogin) {
    redirectingToLogin = true;
    const query = reason === 'idle' ? 'expired=idle' : 'expired=1';
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace(`/login?${query}`);
    }
  }
  // Never resolve/reject so in-flight dashboard effects do not trigger Next.js error overlays during navigation.
  return new Promise<never>(() => {});
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as { accessToken?: string };
      if (!data.accessToken) {
        return null;
      }
      setStoredAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export interface SessionFetchOptions {
  method?: string;
  body?: unknown;
  token?: string;
  tenantId?: string;
  headers?: Record<string, string>;
  skipAuthRefresh?: boolean;
}

export async function fetchWithSession(
  path: string,
  options: SessionFetchOptions = {},
): Promise<Response> {
  const buildHeaders = (accessToken?: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (options.tenantId) {
      headers['x-tenant-id'] = options.tenantId;
    }
    return headers;
  };

  const initialToken = options.skipAuthRefresh
    ? options.token
    : (getStoredAccessToken() ?? options.token);

  const doFetch = (accessToken?: string) =>
    fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: buildHeaders(accessToken),
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  const res = await doFetch(initialToken);

  if (res.status !== 401 || options.skipAuthRefresh || !initialToken) {
    return res;
  }

  const errBody = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof errBody['code'] === 'string' ? errBody['code'] : '';

  if (DEFINITIVE_EXPIRED_CODES.has(code)) {
    return redirectToLoginExpired(code === 'SESSION_IDLE_EXPIRED' ? 'idle' : 'expired');
  }

  const nextToken = await refreshAccessToken();
  if (!nextToken) {
    return redirectToLoginExpired('expired');
  }

  const retryRes = await doFetch(nextToken);
  if (retryRes.status === 401) {
    const retryErr = (await retryRes.clone().json().catch(() => ({}))) as Record<string, unknown>;
    const retryCode = typeof retryErr['code'] === 'string' ? retryErr['code'] : '';
    return redirectToLoginExpired(retryCode === 'SESSION_IDLE_EXPIRED' ? 'idle' : 'expired');
  }

  return retryRes;
}
