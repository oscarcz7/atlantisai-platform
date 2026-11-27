import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Prefix makes leaked gateway tokens easy to spot in secret scanners. */
const TOKEN_PREFIX = 'ngw_';

export function generateGatewayToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/**
 * Gateway tokens carry 256 bits of entropy, so an unsalted SHA-256 is a safe lookup key
 * (unlike low-entropy secrets such as passwords or national IDs).
 */
export function hashGatewayToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Legacy single shared token (GATEWAY_API_TOKEN). Only honoured outside production and only
 * when explicitly configured — there is no hardcoded fallback.
 */
export function matchesLegacyGatewayToken(token: string): boolean {
  if (process.env['NODE_ENV'] === 'production') return false;
  const expected = process.env['GATEWAY_API_TOKEN'];
  if (!expected) return false;
  return safeEqual(token, expected);
}
