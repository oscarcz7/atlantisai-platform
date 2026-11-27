import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FieldEncryptionService } from './field-encryption.service.js';

describe('FieldEncryptionService.hashNationalId', () => {
  const svc = new FieldEncryptionService();

  it('is keyed (not a plain SHA-256), deterministic and normalised', () => {
    const id = '1712345678';
    const h = svc.hashNationalId(id);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(createHash('sha256').update(id).digest('hex'));
    expect(svc.hashNationalId(` ${id} `)).toBe(h);
    expect(svc.hashNationalId('ab123')).toBe(svc.hashNationalId('AB123'));
  });

  it('round-trips encryption', () => {
    expect(svc.decrypt(svc.encrypt('1712345678'))).toBe('1712345678');
  });
});
