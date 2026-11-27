import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const DEV_FALLBACK_KEY = createHash('sha256').update('noah-local-dev-encryption-key').digest();

@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;
  private readonly nationalIdKey: Buffer;

  constructor() {
    const rawKey = process.env['FIELD_ENCRYPTION_KEY'];
    if (rawKey && rawKey.trim().length > 0) {
      const decoded = Buffer.from(rawKey.trim(), 'base64');
      if (decoded.length !== 32) {
        throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes (base64)');
      }
      this.key = decoded;
    } else if (process.env['NODE_ENV'] === 'production') {
      throw new Error('FIELD_ENCRYPTION_KEY is required in production');
    } else {
      this.key = DEV_FALLBACK_KEY;
    }
    // Dedicated HMAC key for national IDs. NATIONAL_ID_HMAC_KEY (base64, >=32 bytes) when set;
    // otherwise derived from the encryption key with HKDF and a distinct label, so it is never
    // stored with the data and never equals the encryption key itself.
    const hmacRaw = process.env['NATIONAL_ID_HMAC_KEY']?.trim();
    if (hmacRaw) {
      const decoded = Buffer.from(hmacRaw, 'base64');
      if (decoded.length < 32) {
        throw new Error('NATIONAL_ID_HMAC_KEY must decode to at least 32 bytes (base64)');
      }
      this.nationalIdKey = decoded;
    } else {
      this.nationalIdKey = Buffer.from(
        hkdfSync('sha256', this.key, Buffer.alloc(0), 'noah:national-id-hmac:v1', 32),
      );
    }
  }

  /**
   * Keyed hash for national IDs (cédula). A plain SHA-256 over ~10^9 possible IDs can be
   * brute-forced in seconds from a DB dump; an HMAC with a secret key cannot.
   * Normalised (trim + upper-case) so the same ID always yields the same hash.
   */
  hashNationalId(value: string): string {
    return createHmac('sha256', this.nationalIdKey).update(value.trim().toUpperCase(), 'utf8').digest('hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    const [ivB64, tagB64, dataB64] = parts as [string, string, string];
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
