import { describe, expect, it } from 'vitest';
import { FieldEncryptionService } from './field-encryption.service.js';
import { TotpService } from './totp.service.js';

describe('TotpService & FieldEncryptionService', () => {
  const totp = new TotpService();
  const enc = new FieldEncryptionService();

  it('generates and verifies RFC 6238 TOTP codes', () => {
    const secret = totp.generateSecret();
    const now = 1_732_360_000_000;
    const code = totp.generateCode(secret, now);

    expect(code).toMatch(/^\d{6}$/);
    expect(totp.verifyCode(secret, code, now)).toBe(true);
    expect(totp.verifyCode(secret, '000000', now)).toBe(false);
  });

  it('encrypts and decrypts secrets with AES-256-GCM', () => {
    const secret = totp.generateSecret();
    const encrypted = enc.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(enc.decrypt(encrypted)).toBe(secret);
  });

  it('generates 8 formatted single-use recovery codes', () => {
    const codes = totp.generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
  });
});
