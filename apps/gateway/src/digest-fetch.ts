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

/** Minimal fetch signature used by the Digest client (global fetch or the pinned-TLS transport). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<Response>;

type HashName = 'md5' | 'sha256';

interface AlgorithmSpec {
  hash: HashName;
  sess: boolean;
  /** Token as it must be echoed in the Authorization header. */
  token: string;
}

const SUPPORTED_ALGORITHMS: Record<string, AlgorithmSpec> = {
  md5: { hash: 'md5', sess: false, token: 'MD5' },
  'md5-sess': { hash: 'md5', sess: true, token: 'MD5-sess' },
  'sha-256': { hash: 'sha256', sess: false, token: 'SHA-256' },
  'sha-256-sess': { hash: 'sha256', sess: true, token: 'SHA-256-sess' },
};

export class DigestAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigestAuthError';
  }
}

function resolveAlgorithm(algorithm: string | undefined): AlgorithmSpec {
  const key = (algorithm ?? 'MD5').trim().toLowerCase();
  const spec = SUPPORTED_ALGORITHMS[key];
  if (!spec) {
    throw new DigestAuthError(
      `Unsupported Digest algorithm "${algorithm}" (supported: MD5, MD5-sess, SHA-256, SHA-256-sess).`,
    );
  }
  return spec;
}

function hash(name: HashName, value: string): string {
  return createHash(name).update(value, 'utf8').digest('hex');
}

/** Quoted-string escaping for header values (RFC 7230 §3.2.6). */
function quote(value: string): string {
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function parseParams(segment: string): Record<string, string> {
  const params: Record<string, string> = {};
  // Accepts token=value, token="", token="with \"escapes\"".
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(segment)) !== null) {
    const key = match[1]?.toLowerCase();
    const raw = match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : (match[3] ?? '');
    if (key && !(key in params)) params[key] = raw;
  }
  return params;
}

/**
 * Parses every Digest challenge in a (possibly merged) WWW-Authenticate header.
 * Servers may send several challenges (e.g. SHA-256 and MD5, or Digest + Basic), which
 * fetch/Node join with ", ".
 */
export function parseDigestChallenges(header: string): DigestChallenge[] {
  const segments = header.split(/,?\s*(?=\b(?:digest|basic|bearer|negotiate|ntlm)\s)/i);
  const out: DigestChallenge[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!/^digest\s/i.test(trimmed)) continue;
    const params = parseParams(trimmed.slice(7));
    // realm may legitimately be empty; nonce may not.
    if (params['realm'] === undefined || !params['nonce']) continue;
    out.push({
      realm: params['realm'],
      nonce: params['nonce'],
      qop: params['qop'],
      opaque: params['opaque'],
      algorithm: params['algorithm'],
    });
  }
  return out;
}

/** Returns the strongest supported Digest challenge (SHA-256 preferred over MD5), or null. */
export function parseDigestChallenge(header: string): DigestChallenge | null {
  const challenges = parseDigestChallenges(header);
  if (challenges.length === 0) return null;
  const rank = (c: DigestChallenge) => {
    const key = (c.algorithm ?? 'md5').toLowerCase();
    if (!(key in SUPPORTED_ALGORITHMS)) return -1;
    return key.startsWith('sha-256') ? 2 : 1;
  };
  const sorted = [...challenges].sort((a, b) => rank(b) - rank(a));
  return sorted[0] ?? null;
}

export function formatNc(n: number): string {
  return n.toString(16).padStart(8, '0');
}

/**
 * Builds the Authorization header value (RFC 7616 / RFC 2617).
 * Throws DigestAuthError for unsupported algorithms or qop values.
 */
export function buildDigestAuthHeader(
  method: string,
  uri: string,
  creds: DigestCredentials,
  challenge: DigestChallenge,
  nc = '00000001',
  cnonce = randomBytes(8).toString('hex'),
  body = '',
): string {
  const algo = resolveAlgorithm(challenge.algorithm);
  const H = (v: string) => hash(algo.hash, v);

  const offeredQop = challenge.qop
    ?.split(',')
    .map((q) => q.trim().toLowerCase())
    .filter(Boolean);
  let qop: 'auth' | 'auth-int' | undefined;
  if (offeredQop && offeredQop.length > 0) {
    if (offeredQop.includes('auth')) qop = 'auth';
    else if (offeredQop.includes('auth-int')) qop = 'auth-int';
    else throw new DigestAuthError(`Unsupported Digest qop "${challenge.qop}".`);
  }

  if (algo.sess && !qop) {
    throw new DigestAuthError(`Digest algorithm ${algo.token} requires qop, but none was offered.`);
  }

  let ha1 = H(`${creds.username}:${challenge.realm}:${creds.password}`);
  if (algo.sess) {
    ha1 = H(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 =
    qop === 'auth-int'
      ? H(`${method.toUpperCase()}:${uri}:${H(body)}`)
      : H(`${method.toUpperCase()}:${uri}`);

  const response = qop
    ? H(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : H(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username=${quote(creds.username)}`,
    `realm=${quote(challenge.realm)}`,
    `nonce=${quote(challenge.nonce)}`,
    `uri=${quote(uri)}`,
    `response="${response}"`,
  ];
  if (challenge.algorithm) {
    parts.push(`algorithm=${algo.token}`);
  }
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce=${quote(cnonce)}`);
  }
  if (challenge.opaque !== undefined) {
    parts.push(`opaque=${quote(challenge.opaque)}`);
  }
  return `Digest ${parts.join(', ')}`;
}

export interface DigestRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface DigestClientOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

/**
 * Stateful HTTP Digest client (one per reader).
 *
 * - The first request to a reader is a body-less probe: the request body (which may contain
 *   cardNo / QR content) is only ever sent together with a Digest Authorization header.
 * - The challenge is cached and reused with an incrementing nonce-count (nc); a 401 on a reused
 *   nonce (stale) triggers exactly one re-authentication with the fresh challenge.
 * - Every request is bounded by AbortSignal.timeout.
 */
export class DigestClient {
  private challenge: DigestChallenge | null = null;
  private nc = 0;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly creds: DigestCredentials,
    options: DigestClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  private nextNc(): string {
    this.nc += 1;
    return formatNc(this.nc);
  }

  private adoptChallenge(res: Response): DigestChallenge | null {
    const header = res.headers.get('www-authenticate');
    if (!header) return null;
    const challenge = parseDigestChallenge(header);
    if (!challenge) return null;
    // Validate early so an unsupported algorithm fails clearly instead of looping.
    resolveAlgorithm(challenge.algorithm);
    if (!this.challenge || this.challenge.nonce !== challenge.nonce) {
      this.nc = 0;
    }
    this.challenge = challenge;
    return challenge;
  }

  private async send(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    return this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private authed(
    url: string,
    method: string,
    uri: string,
    init: DigestRequestInit,
    challenge: DigestChallenge,
    timeoutMs: number,
  ): Promise<Response> {
    const authHeader = buildDigestAuthHeader(
      method,
      uri,
      this.creds,
      challenge,
      this.nextNc(),
      undefined,
      init.body ?? '',
    );
    return this.send(
      url,
      method,
      { ...(init.headers ?? {}), Authorization: authHeader },
      init.body,
      timeoutMs,
    );
  }

  async request(url: string, init: DigestRequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const parsedUrl = new URL(url);
    const uri = `${parsedUrl.pathname}${parsedUrl.search}`;
    const timeoutMs = init.timeoutMs ?? this.timeoutMs;
    const hasBody = init.body !== undefined && init.body !== '';

    if (this.challenge) {
      const previousNonce = this.challenge.nonce;
      const res = await this.authed(url, method, uri, init, this.challenge, timeoutMs);
      if (res.status !== 401) return res;
      const fresh = this.adoptChallenge(res);
      if (!fresh || fresh.nonce === previousNonce) {
        // Same nonce rejected => wrong credentials, not a stale nonce. Don't retry: Hikvision
        // locks the account/IP after a few failed attempts.
        this.challenge = null;
        return res;
      }
      await res.body?.cancel().catch(() => undefined);
      return this.authed(url, method, uri, init, fresh, timeoutMs);
    }

    // Unauthenticated probe: never carries the body.
    const probeHeaders: Record<string, string> = { ...(init.headers ?? {}) };
    delete probeHeaders['Content-Type'];
    delete probeHeaders['content-type'];
    const probe = await this.send(url, method, probeHeaders, undefined, timeoutMs);

    if (probe.status !== 401) {
      if (hasBody) {
        await probe.body?.cancel().catch(() => undefined);
        throw new DigestAuthError(
          `Reader did not request Digest authentication (HTTP ${probe.status} on probe); refusing to send request body.`,
        );
      }
      return probe;
    }

    const challenge = this.adoptChallenge(probe);
    if (!challenge) {
      // Not a Digest challenge (e.g. Basic only). Surface the 401 as-is; never fall back to Basic.
      return probe;
    }
    await probe.body?.cancel().catch(() => undefined);
    return this.authed(url, method, uri, init, challenge, timeoutMs);
  }
}

/**
 * One-off Digest request (no challenge caching). Prefer a long-lived DigestClient per reader.
 */
export async function digestFetch(
  url: string,
  init: DigestRequestInit,
  creds: DigestCredentials,
  options: DigestClientOptions = {},
): Promise<Response> {
  return new DigestClient(creds, options).request(url, init);
}
