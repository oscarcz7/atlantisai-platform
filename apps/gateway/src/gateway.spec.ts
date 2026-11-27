import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  checkReaderTarget,
  ConfigError,
  isForbiddenReaderIp,
  loadConfig,
  parseAllowlistEnv,
  parseReadersJson,
  type GatewayConfig,
} from './config.js';
import {
  buildDigestAuthHeader,
  DigestAuthError,
  DigestClient,
  parseDigestChallenge,
  type FetchLike,
} from './digest-fetch.js';
import { FakeDevice } from './fake-device.js';
import {
  ApiError,
  createApiClient,
  Gateway,
  PURGE_NOT_IMPLEMENTED,
  REMOTE_OPEN_DISABLED,
  type ApiClient,
  type PulledCommand,
} from './gateway.js';
import { formatHikvisionLocalTime, HikvisionIsapiDevice } from './hikvision-isapi.device.js';
import { normalizeFingerprint } from './reader-transport.js';

const silentLog = { info: () => undefined, error: () => undefined };

function baseConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    apiUrl: 'https://api.example.test',
    apiToken: 'tok',
    tenant: 'noah',
    mode: 'hikvision',
    pollMs: 3000,
    heartbeatMs: 60_000,
    httpTimeoutMs: 10_000,
    allowRemoteOpen: false,
    hikUser: 'svc',
    hikPass: 'pw',
    employeePrefix: 'NX',
    allowlist: [{ ip: '192.168.1.64', port: 80 }],
    ...overrides,
  };
}

function cmd(partial: Partial<PulledCommand> = {}): PulledCommand {
  return {
    id: 'c1',
    idempotencyKey: 'k1',
    type: 'UPSERT_CREDENTIAL',
    payload: {
      employeeNo: 'NX0001',
      cardNo: '1234567890',
      validFrom: '2026-11-25T10:00:00Z',
      validTo: '2026-11-25T12:00:00Z',
    },
    reader: {
      id: 'r1',
      code: 'GYM',
      name: 'Gym',
      protocol: 'http',
      ip: '192.168.1.64',
      port: 80,
      doorNo: 1,
    },
    ...partial,
  };
}

function setup(configOverrides: Partial<GatewayConfig> = {}, apiImpl?: ApiClient['request']) {
  const devices: FakeDevice[] = [];
  const factory = vi.fn((r: { code: string }) => {
    const d = new FakeDevice(r.code, 'NX');
    devices.push(d);
    return d;
  });
  const calls: Array<{ path: string; body?: unknown }> = [];
  const api: ApiClient = {
    request: (apiImpl ??
      (async (path: string, init?: { body?: unknown }) => {
        calls.push({ path, body: init?.body });
        return {} as never;
      })) as ApiClient['request'],
  };
  const gw = new Gateway(baseConfig(configOverrides), api, factory, silentLog);
  return { gw, factory, devices, calls };
}

const hanging: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });

describe('FakeDevice & helpers', () => {
  it('FakeDevice enforces employeeNo prefix and supports idempotent upsert/revoke', async () => {
    const dev = new FakeDevice('READER_GYM', 'NX');
    await expect(
      dev.upsertCredential({
        employeeNo: 'RESIDENT01',
        cardNo: '9999999999',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow(/prefix/);

    await dev.upsertCredential({
      employeeNo: 'NX0001TEST',
      cardNo: '1234567890',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 60_000),
    });
    expect(dev.listLoadedEmployeeNos()).toEqual(['NX0001TEST']);

    await dev.revokeCredential('NX0001TEST');
    expect(dev.listLoadedEmployeeNos()).toEqual([]);
  });

  it('formats Hikvision local timestamps in America/Guayaquil', () => {
    const utc = new Date('2026-11-25T19:30:00.000Z'); // 14:30 in UTC-5
    expect(formatHikvisionLocalTime(utc, 'America/Guayaquil')).toBe('2026-11-25T14:30:00');
  });
});

describe('Reader allowlist / SSRF guard', () => {
  it('flags loopback, link-local, unspecified and non-IP targets as forbidden', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '0.0.0.0',
      '::1',
      '::',
      'fe80::1',
      'febf::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '[::1]',
      'localhost',
      'reader.local',
    ]) {
      expect(isForbiddenReaderIp(ip), ip).toBe(true);
    }
    for (const ip of ['192.168.1.64', '10.0.0.5', '172.16.3.4', 'fd00::5']) {
      expect(isForbiddenReaderIp(ip), ip).toBe(false);
    }
  });

  it('parses env allowlist entries and refuses loopback/link-local entries', () => {
    expect(parseAllowlistEnv('192.168.1.64, 192.168.1.65:8443,[fd00::5]:443,fd00::6')).toEqual([
      { ip: '192.168.1.64' },
      { ip: '192.168.1.65', port: 8443 },
      { ip: 'fd00::5', port: 443 },
      { ip: 'fd00::6' },
    ]);
    expect(() => parseAllowlistEnv('127.0.0.1')).toThrow(ConfigError);
    expect(() => parseAllowlistEnv('169.254.169.254:80')).toThrow(/never allowed/);
    expect(() => parseAllowlistEnv('reader.local')).toThrow(/IP literal/);
    expect(() => parseAllowlistEnv('192.168.1.64:99999')).toThrow(/port/);
  });

  it('parses the readers JSON file with TLS pins', () => {
    const fp = 'ab'.repeat(32);
    const entries = parseReadersJson(
      JSON.stringify({
        readers: [{ ip: '192.168.1.70', port: 443, code: 'POOL', fingerprint256: fp }],
      }),
      'test',
    );
    expect(entries[0]).toMatchObject({
      ip: '192.168.1.70',
      port: 443,
      protocol: 'https',
      code: 'POOL',
      tls: { fingerprint256: normalizeFingerprint(fp) },
    });
    expect(() => parseReadersJson('[{"ip":"169.254.1.1"}]', 'test')).toThrow(ConfigError);
    expect(() =>
      parseReadersJson(
        '[{"ip":"192.168.1.1","protocol":"http","fingerprint256":"' + fp + '"}]',
        'test',
      ),
    ).toThrow(/protocol/);
  });

  it('checkReaderTarget enforces ip, port and protocol', () => {
    const allow = [
      { ip: '192.168.1.64', port: 80 },
      { ip: '192.168.1.70', protocol: 'https' as const },
    ];
    expect(
      checkReaderTarget({ ip: '192.168.1.64', port: 80, protocol: 'http' }, allow, true).ok,
    ).toBe(true);
    expect(
      checkReaderTarget({ ip: '192.168.1.64', port: 8080, protocol: 'http' }, allow, true).ok,
    ).toBe(false);
    expect(
      checkReaderTarget({ ip: '192.168.1.99', port: 80, protocol: 'http' }, allow, true).ok,
    ).toBe(false);
    expect(
      checkReaderTarget({ ip: '192.168.1.70', port: 443, protocol: 'http' }, allow, true),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/protocol mismatch/),
    });
    expect(
      checkReaderTarget({ ip: '192.168.1.70', port: 8443, protocol: 'https' }, allow, true).ok,
    ).toBe(true);
    expect(
      checkReaderTarget({ ip: '192.168.1.64', port: 80, protocol: 'ftp' }, allow, true).ok,
    ).toBe(false);
  });

  it('rejects commands for readers not in the allowlist without creating a device', async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const { gw, factory } = setup({}, async (path: string, init?: { body?: unknown }) => {
      if (path.startsWith('/access/gateway/commands?')) {
        return [cmd({ reader: { ...cmd().reader!, ip: '192.168.1.99' } })] as never;
      }
      calls.push({ path, body: init?.body });
      return {} as never;
    });
    await gw.processOnce();
    expect(factory).not.toHaveBeenCalled();
    expect(calls).toEqual([
      {
        path: '/access/gateway/commands/c1/ack',
        body: { ok: false, error: expect.stringMatching(/not in local allowlist/) },
      },
    ]);
  });

  it('rejects loopback / metadata targets even in fake mode with no allowlist', async () => {
    const { gw, factory } = setup({ mode: 'fake', allowlist: [] });
    for (const ip of ['127.0.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1']) {
      const res = await gw.executeCommand(cmd({ reader: { ...cmd().reader!, ip } }));
      expect(res.ok, ip).toBe(false);
      expect(res.error).toMatch(/loopback\/link-local/);
    }
    expect(factory).not.toHaveBeenCalled();
    // Private LAN target is fine in fake mode without allowlist.
    expect((await gw.executeCommand(cmd())).ok).toBe(true);
  });

  it('accepts allowlisted readers', async () => {
    const { gw, devices } = setup();
    expect(await gw.executeCommand(cmd())).toEqual({ ok: true });
    expect(devices[0]?.listLoadedEmployeeNos()).toEqual(['NX0001']);
  });
});

describe('Config hygiene', () => {
  const env = {
    GATEWAY_API_URL: 'https://api.example.test',
    GATEWAY_API_TOKEN: 't',
    GATEWAY_MODE: 'hikvision',
    HIKVISION_USER: 'svc',
    HIKVISION_PASS: 'pw',
    GATEWAY_READER_ALLOWLIST: '192.168.1.64',
  };

  it('loads a valid hikvision config with safe defaults', () => {
    const c = loadConfig(env);
    expect(c.allowRemoteOpen).toBe(false);
    expect(c.heartbeatMs).toBe(60_000);
    expect(c.httpTimeoutMs).toBe(10_000);
    expect(c.allowlist).toEqual([{ ip: '192.168.1.64' }]);
  });

  it('refuses to start in hikvision mode with an empty allowlist', () => {
    expect(() => loadConfig({ ...env, GATEWAY_READER_ALLOWLIST: '' })).toThrow(/allowlist/);
  });

  it('requires HIKVISION_USER (no admin default) and the API token', () => {
    expect(() => loadConfig({ ...env, HIKVISION_USER: undefined })).toThrow(/HIKVISION_USER/);
    expect(() => loadConfig({ ...env, GATEWAY_API_TOKEN: '' })).toThrow(/GATEWAY_API_TOKEN/);
  });

  it('rejects non-https API URLs except localhost', () => {
    expect(() => loadConfig({ ...env, GATEWAY_API_URL: 'http://api.example.test' })).toThrow(
      /https/,
    );
    expect(() =>
      loadConfig({ ...env, GATEWAY_MODE: 'fake', GATEWAY_API_URL: 'http://evil.test' }),
    ).toThrow(/https/);
    expect(loadConfig({ ...env, GATEWAY_API_URL: 'http://localhost:4000' }).apiUrl).toBe(
      'http://localhost:4000',
    );
  });

  it('loads readers from GATEWAY_READERS_FILE', () => {
    const c = loadConfig(
      { ...env, GATEWAY_READER_ALLOWLIST: undefined, GATEWAY_READERS_FILE: '/etc/readers.json' },
      () => '[{"ip":"192.168.1.80","port":80,"code":"LOBBY"}]',
    );
    expect(c.allowlist).toEqual([{ ip: '192.168.1.80', port: 80, code: 'LOBBY' }]);
  });
});

describe('Command handling', () => {
  it('rejects OPEN_DOOR by default without touching the reader', async () => {
    const { gw, factory } = setup();
    const res = await gw.executeCommand(cmd({ type: 'OPEN_DOOR', payload: {} }));
    expect(res).toEqual({ ok: false, error: REMOTE_OPEN_DISABLED });
    expect(factory).not.toHaveBeenCalled();
  });

  it('allows OPEN_DOOR when GATEWAY_ALLOW_REMOTE_OPEN=true', async () => {
    const { gw, devices } = setup({ allowRemoteOpen: true });
    expect(await gw.executeCommand(cmd({ type: 'OPEN_DOOR', payload: { doorNo: 2 } }))).toEqual({
      ok: true,
    });
    expect(devices[0]?.openedDoors).toEqual([2]);
  });

  it('PURGE does not claim success', async () => {
    const { gw } = setup();
    const res = await gw.executeCommand(cmd({ type: 'PURGE', payload: {} }));
    expect(res).toEqual({ ok: false, error: PURGE_NOT_IMPLEMENTED });
  });

  it('PING reflects real reader reachability', async () => {
    const { gw, devices } = setup();
    expect(await gw.executeCommand(cmd({ type: 'PING', payload: {} }))).toEqual({ ok: true });
    devices[0]!.online = false;
    const res = await gw.executeCommand(cmd({ type: 'PING', payload: {} }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unreachable/);
  });

  it('rejects malformed payloads and unknown types', async () => {
    const { gw } = setup();
    expect((await gw.executeCommand(cmd({ payload: { employeeNo: 'NX1' } }))).ok).toBe(false);
    expect((await gw.executeCommand(cmd({ type: 'FORMAT_DISK' }))).error).toMatch(
      /unknown command type/,
    );
    expect((await gw.executeCommand(cmd({ reader: null }))).ok).toBe(false);
  });

  it('isolates each command: a failed ACK does not abort the rest of the batch', async () => {
    const acked: string[] = [];
    const { gw } = setup({}, async (path: string) => {
      if (path.startsWith('/access/gateway/commands?')) {
        return [cmd({ id: 'a' }), cmd({ id: 'b', type: 'PURGE' }), cmd({ id: 'c' })] as never;
      }
      if (path.includes('/a/ack')) throw new ApiError('API 500: boom', 500);
      acked.push(path);
      return {} as never;
    });
    await gw.processOnce();
    expect(acked).toEqual(['/access/gateway/commands/b/ack', '/access/gateway/commands/c/ack']);
  });

  it('heartbeat reports per-reader status, including readers declared only in the allowlist', async () => {
    const { gw, calls } = setup({
      allowlist: [
        { ip: '192.168.1.64', port: 80 },
        { ip: '192.168.1.80', port: 80, code: 'LOBBY' },
      ],
    });
    await gw.executeCommand(cmd({ type: 'PING', payload: {} }));
    await gw.sendHeartbeat();
    const hb = calls.find((c) => c.path === '/access/gateway/heartbeat');
    expect(hb?.body).toEqual({
      readers: expect.arrayContaining([
        { code: 'LOBBY', online: true, firmware: 'FAKE-POC-1.0' },
        { readerId: 'r1', online: true, firmware: 'FAKE-POC-1.0' },
      ]),
    });
  });
});

describe('Timeouts', () => {
  it('API client aborts hung requests', async () => {
    const api = createApiClient(
      { apiUrl: 'https://api.example.test', apiToken: 't', tenant: 'noah', httpTimeoutMs: 30 },
      ((_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        )) as typeof fetch,
    );
    await expect(api.request('/access/gateway/commands')).rejects.toThrow(/timeout/);
  });

  it('a hung API call does not leave the poll loop stuck', async () => {
    const api = createApiClient(
      { apiUrl: 'https://api.example.test', apiToken: 't', tenant: 'noah', httpTimeoutMs: 30 },
      ((_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
        )) as typeof fetch,
    );
    const gw = new Gateway(baseConfig(), api, undefined, silentLog);
    await gw.pollOnce();
    expect(gw.isBusy).toBe(false);
  });

  it('ISAPI requests time out and the reader is reported offline', async () => {
    const dev = new HikvisionIsapiDevice({
      protocol: 'http',
      ip: '192.168.1.64',
      port: 80,
      credentials: { username: 'svc', password: 'pw' },
      timeoutMs: 30,
      fetchImpl: hanging,
    });
    expect(await dev.getStatus()).toEqual({ online: false, error: 'timeout' });
    await expect(
      new DigestClient(
        { username: 'u', password: 'p' },
        { timeoutMs: 30, fetchImpl: hanging },
      ).request('http://192.168.1.64/x'),
    ).rejects.toThrow();
  });
});

describe('Digest auth', () => {
  it('parses Hikvision Digest challenge and builds Authorization header', () => {
    const header = 'Digest qop="auth", realm="DS-K1T344", nonce="abcdef123456", stale="false"';
    const challenge = parseDigestChallenge(header);
    expect(challenge).not.toBeNull();
    expect(challenge?.realm).toBe('DS-K1T344');

    const auth = buildDigestAuthHeader(
      'GET',
      '/ISAPI/System/deviceInfo',
      { username: 'admin', password: 'secret' },
      challenge!,
      '00000001',
      '0a4f113b',
    );
    expect(auth).toContain('Digest username="admin"');
    expect(auth).toContain('qop=auth');
    expect(auth).toContain('response="');
  });

  it('tolerates empty quoted values and picks Digest among multiple challenges', () => {
    const c = parseDigestChallenge(
      'Basic realm="x", Digest realm="", nonce="n1", opaque="", qop="auth"',
    );
    expect(c).toEqual({ realm: '', nonce: 'n1', opaque: '', qop: 'auth', algorithm: undefined });
    const best = parseDigestChallenge(
      'Digest realm="r", nonce="a", algorithm=MD5, qop="auth", Digest realm="r", nonce="b", algorithm=SHA-256, qop="auth"',
    );
    expect(best?.algorithm).toBe('SHA-256');
  });

  const rfc = {
    creds: { username: 'Mufasa', password: 'Circle of Life' },
    uri: '/dir/index.html',
    nc: '00000001',
    cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
    challenge: {
      realm: 'http-auth@example.org',
      nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v',
      qop: 'auth, auth-int',
      opaque: 'FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS',
    },
  };

  it('computes RFC 7616 MD5 and SHA-256 responses', () => {
    const md5 = buildDigestAuthHeader(
      'GET',
      rfc.uri,
      rfc.creds,
      { ...rfc.challenge, algorithm: 'MD5' },
      rfc.nc,
      rfc.cnonce,
    );
    expect(md5).toContain('response="8ca523f5e9506fed4657c9700eebdbec"');
    const sha = buildDigestAuthHeader(
      'GET',
      rfc.uri,
      rfc.creds,
      { ...rfc.challenge, algorithm: 'SHA-256' },
      rfc.nc,
      rfc.cnonce,
    );
    expect(sha).toContain(
      'response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"',
    );
    expect(sha).toContain('algorithm=SHA-256');
  });

  it('computes MD5-sess responses', () => {
    const h = (v: string) => createHash('md5').update(v).digest('hex');
    const { creds, challenge, uri, nc, cnonce } = rfc;
    const ha1 = h(
      `${h(`${creds.username}:${challenge.realm}:${creds.password}`)}:${challenge.nonce}:${cnonce}`,
    );
    const ha2 = h(`GET:${uri}`);
    const expected = h(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
    const header = buildDigestAuthHeader(
      'GET',
      uri,
      creds,
      { ...challenge, algorithm: 'MD5-sess' },
      nc,
      cnonce,
    );
    expect(header).toContain(`response="${expected}"`);
    expect(header).toContain('algorithm=MD5-sess');
  });

  it('fails clearly on unsupported algorithms', () => {
    expect(() =>
      buildDigestAuthHeader('GET', '/', rfc.creds, { ...rfc.challenge, algorithm: 'SHA-512-256' }),
    ).toThrow(DigestAuthError);
  });

  it('never sends the body on the unauthenticated first request and increments nc', async () => {
    const seen: Array<{ method: string; headers: Record<string, string>; body?: string }> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push({
        method: init.method,
        headers: init.headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
      });
      if (!init.headers['Authorization']) {
        return new Response('', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Digest realm="DS", nonce="n1", qop="auth", algorithm=MD5',
          },
        });
      }
      return new Response('{}', { status: 200 });
    };
    const client = new DigestClient({ username: 'svc', password: 'pw' }, { fetchImpl });
    const body = JSON.stringify({ CardInfo: { cardNo: 'SECRET-QR' } });
    const res = await client.request(
      'http://192.168.1.64/ISAPI/AccessControl/CardInfo/Record?format=json',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    expect(res.status).toBe(200);
    expect(seen[0]?.body).toBeUndefined();
    expect(JSON.stringify(seen[0])).not.toContain('SECRET-QR');
    expect(seen[1]?.body).toBe(body);
    expect(seen[1]?.headers['Authorization']).toContain('nc=00000001');

    // Cached challenge: next request goes authenticated directly with nc incremented.
    await client.request('http://192.168.1.64/ISAPI/System/deviceInfo');
    expect(seen).toHaveLength(3);
    expect(seen[2]?.headers['Authorization']).toContain('nc=00000002');
  });

  it('does not retry with the same nonce (wrong credentials) to avoid reader lockout', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls++;
      return new Response('', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Digest realm="DS", nonce="same", qop="auth"' },
      });
    };
    const client = new DigestClient({ username: 'u', password: 'bad' }, { fetchImpl });
    expect((await client.request('http://192.168.1.64/x')).status).toBe(401);
    expect(calls).toBe(2); // probe + one authenticated attempt
    expect((await client.request('http://192.168.1.64/x')).status).toBe(401);
    expect(calls).toBe(3); // one authenticated attempt with cached nonce, no extra retry
  });

  it('refuses to send a body when the reader does not challenge', async () => {
    const fetchImpl: FetchLike = async () => new Response('ok', { status: 200 });
    const client = new DigestClient({ username: 'u', password: 'p' }, { fetchImpl });
    await expect(
      client.request('http://192.168.1.64/x', { method: 'PUT', body: '{"a":1}' }),
    ).rejects.toThrow(/refusing to send request body/);
  });
});
