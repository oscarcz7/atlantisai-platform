import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const DEV_FALLBACK_KEY = createHash('sha256').update('noah-local-dev-encryption-key').digest();

@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

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
