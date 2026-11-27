import { createHash, randomBytes } from 'node:crypto';

export interface DigestCredentials {
  username: string;
  password: string;
}

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

export function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!header.toLowerCase().startsWith('digest ')) return null;
  const params: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)=(?:"([^"]+)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header.slice(7))) !== null) {
    const key = match[1]?.toLowerCase();
    const val = match[2] ?? match[3] ?? '';
    if (key) params[key] = val;
  }
  if (!params['realm'] || !params['nonce']) return null;
  return {
    realm: params['realm'],
    nonce: params['nonce'],
    qop: params['qop'],
    opaque: params['opaque'],
    algorithm: params['algorithm'],
  };
}

export function buildDigestAuthHeader(
  method: string,
  uri: string,
  creds: DigestCredentials,
  challenge: DigestChallenge,
  nc = '00000001',
  cnonce = randomBytes(8).toString('hex'),
): string {
  const ha1 = md5(`${creds.username}:${challenge.realm}:${creds.password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);

  const qop = challenge.qop?.split(',').map((q) => q.trim()).includes('auth') ? 'auth' : undefined;
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${creds.username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

/**
 * Performs an HTTP/HTTPS request using RFC 2617 HTTP Digest Authentication (standard for Hikvision ISAPI).
 */
export async function digestFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
  creds: DigestCredentials,
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const parsedUrl = new URL(url);
  const uri = `${parsedUrl.pathname}${parsedUrl.search}`;
  const timeoutMs = init.timeoutMs ?? 8000;

  const firstRes = await fetch(url, {
    method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (firstRes.status !== 401) {
    return firstRes;
  }

  const wwwAuth = firstRes.headers.get('www-authenticate');
  if (!wwwAuth) {
    return firstRes;
  }

  const challenge = parseDigestChallenge(wwwAuth);
  if (!challenge) {
    return firstRes;
  }

  const authHeader = buildDigestAuthHeader(method, uri, creds, challenge);
  return fetch(url, {
    method,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authHeader,
    },
    body: init.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
