import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export interface PassTokenPayload {
  /** Credential ID (UUID) */
  cid: string;
  /** Tenant ID (UUID) */
  tid: string;
  /** Expiration unix timestamp in seconds (matches credential validTo + small grace) */
  exp: number;
}

function getSigningSecret(): string {
  return (
    process.env['PASS_SIGNING_SECRET'] ||
    process.env['JWT_SECRET'] ||
    'dev-noah-pass-signing-secret-change-me'
  );
}

/**
 * Generates an employeeNo with the configured system prefix (default "NX") so our
 * credentials never collide with pre-existing EM 125 kHz resident tags on Hikvision readers.
 */
export function generateEmployeeNo(prefix?: string): string {
  const cleanPrefix = (prefix ?? process.env['HIKVISION_EMPLOYEE_PREFIX'] ?? 'NX')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  const bytes = randomBytes(5);
  const num = bytes.readUIntBE(0, 5); // 40-bit unsigned random integer
  const suffix = num.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
  return `${cleanPrefix || 'NX'}${suffix}`;
}

/**
 * Generates a cryptographically random numeric cardNo for QR scanning on Hikvision terminals.
 * Avoids leading zero so firmwares that parse cardNo as uint64 match the exact string.
 */
export function generateNumericCardCode(digits?: number): string {
  const targetDigits = Math.min(
    20,
    Math.max(8, digits ?? Number(process.env['HIKVISION_CARD_DIGITS'] ?? 10)),
  );
  let code = String(randomInt(1, 10)); // first digit 1..9
  for (let i = 1; i < targetDigits; i++) {
    code += String(randomInt(0, 10));
  }
  return code;
}

export function signPassToken(payload: PassTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSigningSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyPassToken(token: string): PassTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = createHmac('sha256', getSigningSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<PassTokenPayload>;
    if (typeof parsed.cid !== 'string' || typeof parsed.tid !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    return { cid: parsed.cid, tid: parsed.tid, exp: parsed.exp };
  } catch {
    return null;
  }
}
