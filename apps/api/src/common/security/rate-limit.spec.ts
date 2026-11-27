import { describe, expect, it, vi } from 'vitest';
import { createRateLimitMiddleware, FixedWindowLimiter } from './rate-limit.js';

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(n: string, v: string) {
      res.headers[n] = v;
    },
    json(b: unknown) {
      res.body = b;
    },
  };
  return res;
}

describe('rate limit', () => {
  it('allows up to the limit then blocks until the window resets', () => {
    const l = new FixedWindowLimiter();
    expect(l.hit('k', 2, 1000, 0)).toBe(0);
    expect(l.hit('k', 2, 1000, 10)).toBe(0);
    expect(l.hit('k', 2, 1000, 20)).toBeGreaterThan(0);
    expect(l.hit('k', 2, 1000, 1001)).toBe(0);
  });

  it('returns 429 only on matching routes and keys by IP', () => {
    const mw = createRateLimitMiddleware([{ pattern: /^\/auth\/login$/, limit: 1, windowMs: 60_000 }]);
    const next = vi.fn();
    mw({ ip: '1.1.1.1', method: 'POST', path: '/auth/login' }, fakeRes(), next);
    const blocked = fakeRes();
    mw({ ip: '1.1.1.1', method: 'POST', path: '/auth/login' }, blocked, next);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeDefined();
    mw({ ip: '2.2.2.2', method: 'POST', path: '/auth/login' }, fakeRes(), next);
    mw({ ip: '1.1.1.1', method: 'GET', path: '/units' }, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});
