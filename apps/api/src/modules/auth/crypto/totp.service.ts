import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * RFC 6238 TOTP service (HMAC-SHA1, 6 digits, 30-second period).
 */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  generateCode(secret: string, nowMs: number = Date.now()): string {
    const counter = Math.floor(nowMs / 1000 / STEP_SECONDS);
    return this.hotp(secret, counter);
  }

  verifyCode(secret: string, code: string, nowMs: number = Date.now(), window = 1): boolean {
    const normalized = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }
    const currentCounter = Math.floor(nowMs / 1000 / STEP_SECONDS);
    const inputBuf = Buffer.from(normalized, 'utf8');

    for (let offset = -window; offset <= window; offset++) {
      const expected = this.hotp(secret, currentCounter + offset);
      const expectedBuf = Buffer.from(expected, 'utf8');
      if (timingSafeEqual(inputBuf, expectedBuf)) {
        return true;
      }
    }
    return false;
  }

  buildOtpAuthUri(email: string, secret: string, issuer = 'Plataforma NOAH'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  }

  async generateQrDataUrl(otpAuthUri: string): Promise<string> {
    return QRCode.toDataURL(otpAuthUri, { width: 240, margin: 1 });
  }

  generateRecoveryCodes(count = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const raw = randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
    }
    return codes;
  }

  private hotp(secret: string, counter: number): string {
    const key = base32Decode(secret);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));

    const hmac = createHmac('sha1', key).update(counterBuf).digest();
    const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
    const binary =
      (((hmac[offset] ?? 0) & 0x7f) << 24) |
      (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
      (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
      ((hmac[offset + 3] ?? 0) & 0xff);

    return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
  }
}
