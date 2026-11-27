import { describe, expect, it } from 'vitest';
import { buildDigestAuthHeader, parseDigestChallenge } from './digest-fetch.js';
import { FakeDevice } from './fake-device.js';
import { formatHikvisionLocalTime } from './hikvision-isapi.device.js';

describe('Edge Gateway devices & Digest auth', () => {
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

  it('formats Hikvision local timestamps in America/Guayaquil', () => {
    const utc = new Date('2026-11-25T19:30:00.000Z'); // 14:30 in UTC-5
    expect(formatHikvisionLocalTime(utc, 'America/Guayaquil')).toBe('2026-11-25T14:30:00');
  });
});
