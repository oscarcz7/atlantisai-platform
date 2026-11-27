import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { normalizeFingerprint, type ReaderTlsOptions } from './reader-transport.js';

export type GatewayMode = 'fake' | 'hikvision';
export type ReaderProtocol = 'http' | 'https';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** A reader this gateway is allowed to talk to (local, operator-controlled). */
export interface AllowlistEntry {
  ip: string;
  /** Undefined = any port on that IP. */
  port?: number;
  /** Undefined = whatever the command says (http/https). */
  protocol?: ReaderProtocol;
  /** Optional reader code (used to report heartbeat for readers not yet seen in commands). */
  code?: string;
  tls?: ReaderTlsOptions;
}

export interface GatewayConfig {
  apiUrl: string;
  apiToken: string;
  tenant: string;
  mode: GatewayMode;
  pollMs: number;
  heartbeatMs: number;
  httpTimeoutMs: number;
  allowRemoteOpen: boolean;
  hikUser: string;
  hikPass: string;
  employeePrefix: string;
  allowlist: AllowlistEntry[];
}

// ---------------------------------------------------------------------------
// IP helpers
// ---------------------------------------------------------------------------

function expandIpv6(ip: string): string | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf('%');
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4)
  const v4Tail = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Tail?.[1] && v4Tail[2]) {
    const o = v4Tail[2].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    const hi = ((o[0]! << 8) | o[1]!).toString(16);
    const lo = ((o[2]! << 8) | o[3]!).toString(16);
    addr = `${v4Tail[1]}${hi}:${lo}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0')).join('');
}

function ipv4InCidr(ip: string, base: string, bits: number): boolean {
  const toInt = (v: string) => v.split('.').reduce((acc, p) => acc * 256 + Number(p), 0);
  const size = 2 ** (32 - bits);
  return Math.floor(toInt(ip) / size) === Math.floor(toInt(base) / size);
}

/**
 * Canonical form used for allowlist comparisons: dotted IPv4, or 32-hex-char expanded IPv6.
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) is canonicalized to the IPv4 address. Returns null if not an IP literal.
 */
export function canonicalIp(raw: string): string | null {
  const ip = raw.trim().replace(/^\[(.*)\]$/, '$1');
  const v = isIP(ip);
  if (v === 4)
    return ip
      .split('.')
      .map((o) => String(Number(o)))
      .join('.');
  if (v === 6) {
    const expanded = expandIpv6(ip);
    if (!expanded) return null;
    if (expanded.startsWith('00000000000000000000ffff')) {
      const hi = parseInt(expanded.slice(24, 28), 16);
      const lo = parseInt(expanded.slice(28, 32), 16);
      return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    }
    return expanded;
  }
  return null;
}

/**
 * Targets the gateway must never connect to, whatever the config says:
 * loopback (127/8, ::1), link-local (169.254/16 incl. cloud metadata, fe80::/10),
 * unspecified/"this network" (0.0.0.0/8, ::). Non-IP-literals (hostnames) are also refused
 * to avoid DNS-based bypasses.
 */
export function isForbiddenReaderIp(raw: string): boolean {
  const canon = canonicalIp(raw);
  if (!canon) return true;
  if (isIP(canon) === 4) {
    return (
      ipv4InCidr(canon, '127.0.0.0', 8) ||
      ipv4InCidr(canon, '169.254.0.0', 16) ||
      ipv4InCidr(canon, '0.0.0.0', 8)
    );
  }
  if (/^0{31}[01]$/.test(canon)) return true; // :: and ::1
  if (/^fe[89ab]/.test(canon)) return true; // fe80::/10
  return false;
}

export function formatHostPort(ip: string, port: number): string {
  return isIP(ip) === 6 ? `[${ip}]:${port}` : `${ip}:${port}`;
}

// ---------------------------------------------------------------------------
// Allowlist parsing
// ---------------------------------------------------------------------------

function parsePort(raw: unknown, ctx: string): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ConfigError(`${ctx}: invalid port "${String(raw)}".`);
  }
  return n;
}

function validateIp(raw: string, ctx: string): string {
  const ip = raw.trim().replace(/^\[(.*)\]$/, '$1');
  if (!isIP(ip)) {
    throw new ConfigError(`${ctx}: "${raw}" is not an IP literal (hostnames are not allowed).`);
  }
  if (isForbiddenReaderIp(ip)) {
    throw new ConfigError(
      `${ctx}: ${ip} is a loopback/link-local/unspecified address and is never allowed.`,
    );
  }
  return ip;
}

/** Parses `GATEWAY_READER_ALLOWLIST`: comma-separated `ip`, `ip:port`, `[v6]`, `[v6]:port` or bare IPv6. */
export function parseAllowlistEnv(raw: string | undefined): AllowlistEntry[] {
  if (!raw || !raw.trim()) return [];
  const entries: AllowlistEntry[] = [];
  for (const token of raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    const ctx = `GATEWAY_READER_ALLOWLIST entry "${token}"`;
    let ipPart = token;
    let portPart: string | undefined;
    const bracketed = token.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (bracketed) {
      ipPart = bracketed[1]!;
      portPart = bracketed[2];
    } else if (isIP(token) === 6) {
      ipPart = token;
    } else {
      const idx = token.lastIndexOf(':');
      if (idx > 0) {
        ipPart = token.slice(0, idx);
        portPart = token.slice(idx + 1);
      }
    }
    const ip = validateIp(ipPart, ctx);
    entries.push(portPart !== undefined ? { ip, port: parsePort(portPart, ctx) } : { ip });
  }
  return entries;
}

interface ReaderFileEntry {
  ip?: unknown;
  port?: unknown;
  protocol?: unknown;
  code?: unknown;
  caFile?: unknown;
  ca?: unknown;
  fingerprint256?: unknown;
}

/**
 * Parses the JSON content of `GATEWAY_READERS_FILE`: either an array or `{ "readers": [...] }` of
 * `{ ip, port?, protocol?, code?, caFile?, ca?, fingerprint256? }`.
 */
export function parseReadersJson(
  json: string,
  source: string,
  readFile: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): AllowlistEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new ConfigError(
      `${source}: invalid JSON (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  const list = Array.isArray(data) ? data : (data as { readers?: unknown })?.readers;
  if (!Array.isArray(list)) {
    throw new ConfigError(`${source}: expected an array or { "readers": [...] }.`);
  }
  return list.map((item: ReaderFileEntry, i) => {
    const ctx = `${source} readers[${i}]`;
    if (!item || typeof item !== 'object' || typeof item.ip !== 'string') {
      throw new ConfigError(`${ctx}: "ip" is required.`);
    }
    const entry: AllowlistEntry = { ip: validateIp(item.ip, ctx) };
    if (item.port !== undefined) entry.port = parsePort(item.port, ctx);
    if (item.protocol !== undefined) {
      if (item.protocol !== 'http' && item.protocol !== 'https') {
        throw new ConfigError(`${ctx}: protocol must be "http" or "https".`);
      }
      entry.protocol = item.protocol;
    }
    if (item.code !== undefined) {
      if (typeof item.code !== 'string' || !item.code.trim() || item.code.length > 64) {
        throw new ConfigError(`${ctx}: invalid code.`);
      }
      entry.code = item.code.trim();
    }
    const tls: ReaderTlsOptions = {};
    if (item.fingerprint256 !== undefined) {
      const fp =
        typeof item.fingerprint256 === 'string' ? normalizeFingerprint(item.fingerprint256) : null;
      if (!fp) throw new ConfigError(`${ctx}: fingerprint256 must be a SHA-256 hex fingerprint.`);
      tls.fingerprint256 = fp;
    }
    if (item.ca !== undefined || item.caFile !== undefined) {
      let pem: string;
      if (typeof item.caFile === 'string') {
        try {
          pem = readFile(item.caFile);
        } catch (err) {
          throw new ConfigError(
            `${ctx}: cannot read caFile (${err instanceof Error ? err.message : String(err)}).`,
          );
        }
      } else if (typeof item.ca === 'string') {
        pem = item.ca;
      } else {
        throw new ConfigError(`${ctx}: ca/caFile must be strings.`);
      }
      if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
        throw new ConfigError(`${ctx}: CA is not a PEM certificate.`);
      }
      tls.ca = pem;
    }
    if (tls.ca || tls.fingerprint256) {
      if (entry.protocol === 'http') {
        throw new ConfigError(`${ctx}: TLS pinning configured but protocol is "http".`);
      }
      entry.protocol = 'https';
      entry.tls = tls;
    }
    return entry;
  });
}

export interface ReaderTarget {
  protocol: string;
  ip: string;
  port: number;
}

export type AllowlistDecision =
  | { ok: true; entry: AllowlistEntry | null; protocol: ReaderProtocol; ip: string; port: number }
  | { ok: false; error: string };

/**
 * Decides whether a command target may be contacted. Pure function, no I/O.
 * `requireAllowlist` is true in hikvision mode (and whenever an allowlist is configured).
 */
export function checkReaderTarget(
  target: ReaderTarget,
  allowlist: AllowlistEntry[],
  requireAllowlist: boolean,
): AllowlistDecision {
  const ip = String(target.ip ?? '').trim();
  const port = Number(target.port);
  if (!isIP(ip)) {
    return { ok: false, error: `reader address "${ip}" is not an IP literal; refused` };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `reader port "${String(target.port)}" is invalid; refused` };
  }
  const hostPort = formatHostPort(ip, port);
  if (isForbiddenReaderIp(ip)) {
    return { ok: false, error: `reader ${hostPort} is loopback/link-local/unspecified; refused` };
  }
  const protocol = String(target.protocol ?? 'http').toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    return { ok: false, error: `reader protocol "${protocol}" not supported; refused` };
  }

  if (!requireAllowlist && allowlist.length === 0) {
    return { ok: true, entry: null, protocol, ip, port };
  }

  const canon = canonicalIp(ip);
  const candidates = allowlist.filter((e) => canonicalIp(e.ip) === canon);
  const entry =
    candidates.find((e) => e.port === port) ?? candidates.find((e) => e.port === undefined);
  if (!entry) {
    return { ok: false, error: `reader ${hostPort} not in local allowlist; refused` };
  }
  if (entry.protocol && entry.protocol !== protocol) {
    return {
      ok: false,
      error: `reader ${hostPort} protocol mismatch (command=${protocol}, allowlist=${entry.protocol}); refused`,
    };
  }
  return { ok: true, entry, protocol, ip, port };
}

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function parseBool(raw: string | undefined, name: string, def: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return def;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  throw new ConfigError(`${name} must be true/false (got "${raw}").`);
}

function parseIntEnv(
  raw: string | undefined,
  name: string,
  def: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max} (got "${raw}").`);
  }
  return n;
}

export function isAllowedApiUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}

export function loadConfig(
  env: Record<string, string | undefined>,
  readFile: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): GatewayConfig {
  const apiUrl = (env['GATEWAY_API_URL'] || 'http://localhost:4000').replace(/\/+$/, '');
  if (!isAllowedApiUrl(apiUrl)) {
    throw new ConfigError(
      'GATEWAY_API_URL must use https:// (plain http is only allowed for localhost).',
    );
  }
  const apiToken = env['GATEWAY_API_TOKEN'] ?? '';
  if (!apiToken) {
    throw new ConfigError(
      'GATEWAY_API_TOKEN es obligatorio (genéralo en el dashboard: Acceso → Rotar token del gateway).',
    );
  }
  const modeRaw = (env['GATEWAY_MODE'] || 'fake').toLowerCase();
  if (modeRaw !== 'fake' && modeRaw !== 'hikvision') {
    throw new ConfigError(`GATEWAY_MODE must be "fake" or "hikvision" (got "${modeRaw}").`);
  }
  const mode: GatewayMode = modeRaw;

  const employeePrefix = (env['HIKVISION_EMPLOYEE_PREFIX'] || 'NX').trim();
  if (!/^[A-Za-z0-9]{1,8}$/.test(employeePrefix)) {
    throw new ConfigError('HIKVISION_EMPLOYEE_PREFIX must be 1-8 alphanumeric characters.');
  }

  const hikUser = (env['HIKVISION_USER'] ?? '').trim();
  const hikPass = env['HIKVISION_PASS'] ?? '';
  if (mode === 'hikvision' && !hikUser) {
    throw new ConfigError(
      'HIKVISION_USER es obligatorio en modo hikvision (no hay valor por defecto).',
    );
  }

  const allowlist: AllowlistEntry[] = [...parseAllowlistEnv(env['GATEWAY_READER_ALLOWLIST'])];
  const readersFile = env['GATEWAY_READERS_FILE']?.trim();
  if (readersFile) {
    let content: string;
    try {
      content = readFile(readersFile);
    } catch (err) {
      throw new ConfigError(
        `GATEWAY_READERS_FILE: cannot read ${readersFile} (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    allowlist.push(...parseReadersJson(content, 'GATEWAY_READERS_FILE', readFile));
  }
  if (mode === 'hikvision' && allowlist.length === 0) {
    throw new ConfigError(
      'En modo hikvision la allowlist de lectores es obligatoria: define GATEWAY_READER_ALLOWLIST y/o GATEWAY_READERS_FILE.',
    );
  }

  return {
    apiUrl,
    apiToken,
    tenant: env['GATEWAY_TENANT'] || 'noah',
    mode,
    pollMs: parseIntEnv(env['GATEWAY_POLL_MS'], 'GATEWAY_POLL_MS', 3000, 500, 3_600_000),
    heartbeatMs: parseIntEnv(
      env['GATEWAY_HEARTBEAT_MS'],
      'GATEWAY_HEARTBEAT_MS',
      60_000,
      5_000,
      3_600_000,
    ),
    httpTimeoutMs: parseIntEnv(
      env['GATEWAY_HTTP_TIMEOUT_MS'],
      'GATEWAY_HTTP_TIMEOUT_MS',
      10_000,
      500,
      120_000,
    ),
    allowRemoteOpen: parseBool(
      env['GATEWAY_ALLOW_REMOTE_OPEN'],
      'GATEWAY_ALLOW_REMOTE_OPEN',
      false,
    ),
    hikUser,
    hikPass,
    employeePrefix,
    allowlist,
  };
}
