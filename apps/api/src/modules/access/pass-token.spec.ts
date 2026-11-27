import { describe, expect, it } from 'vitest';
import {
  generateEmployeeNo,
  generateNumericCardCode,
  signPassToken,
  verifyPassToken,
} from './pass-token.js';

describe('pass-token & Hikvision credential helpers', () => {
  it('generates prefixed employeeNo within Hikvision 32-char limit', () => {
    const emp = generateEmployeeNo('NX');
    expect(emp.startsWith('NX')).toBe(true);
    expect(emp.length).toBeLessThanOrEqual(32);
    expect(/^[A-Z0-9]+$/.test(emp)).toBe(true);
  });

  it('generates numeric cardNo without leading zero', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateNumericCardCode(10);
      expect(code).toMatch(/^[1-9]\d{9}$/);
    }
  });

  it('signs and verifies HMAC pass tokens and rejects tampered tokens', () => {
    const token = signPassToken({
      cid: '01950000-0000-7000-8000-000000000001',
      tid: '01950000-0000-7000-8000-000000000002',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const verified = verifyPassToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.cid).toBe('01950000-0000-7000-8000-000000000001');

    // Tamper payload
    const [, sig] = token.split('.');
    const tampered = `${Buffer.from('{"cid":"x","tid":"y","exp":9999999999}').toString('base64url')}.${sig}`;
    expect(verifyPassToken(tampered)).toBeNull();
  });
});
