import { afterEach, describe, expect, it } from 'vitest';
import { generateGatewayToken, hashGatewayToken, matchesLegacyGatewayToken, safeEqual } from './gateway-auth.js';

describe('gateway-auth', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('generates unique high-entropy prefixed tokens with stable hashes', () => {
    const a = generateGatewayToken();
    const b = generateGatewayToken();
    expect(a).toMatch(/^ngw_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(hashGatewayToken(a)).toBe(hashGatewayToken(a));
    expect(hashGatewayToken(a)).not.toBe(hashGatewayToken(b));
  });

  it('compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('has no hardcoded fallback for the legacy token', () => {
    delete process.env['GATEWAY_API_TOKEN'];
    process.env['NODE_ENV'] = 'development';
    expect(matchesLegacyGatewayToken('dev-gateway-token')).toBe(false);
  });

  it('rejects the legacy shared token in production', () => {
    process.env['GATEWAY_API_TOKEN'] = 'shared-secret';
    process.env['NODE_ENV'] = 'development';
    expect(matchesLegacyGatewayToken('shared-secret')).toBe(true);
    process.env['NODE_ENV'] = 'production';
    expect(matchesLegacyGatewayToken('shared-secret')).toBe(false);
  });
});
