import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError, generateUuidV7 } from '@noah/domain';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { FieldEncryptionService } from './crypto/field-encryption.service.js';
import { TotpService } from './crypto/totp.service.js';
import { InMemoryMailer } from './mailer/mailer.interface.js';
import { StaffUsersService } from './staff-users.service.js';

describe('Auth & StaffUsers integration (Spec 002)', () => {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  const totp = new TotpService();
  const mailer = new InMemoryMailer();
  const authService = new AuthService(prisma, encryption, totp, mailer);
  const staffUsersService = new StaffUsersService(prisma, encryption, mailer, authService);

  const tenantAId = generateUuidV7();
  const tenantBId = generateUuidV7();
  const actorId = generateUuidV7();
  const testEmail = `admin-${tenantAId.slice(0, 8)}@noah.test`;
  const expiredInviteEmail = `expired-${tenantAId.slice(0, 8)}@noah.test`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantAId, code: `auth-a-${tenantAId.slice(0, 8)}`, name: 'NOAH Test A' },
        { id: tenantBId, code: `auth-b-${tenantBId.slice(0, 8)}`, name: 'NOAH Test B' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.staffUser.deleteMany({
      where: { email: { in: [testEmail, expiredInviteEmail] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await prisma.$disconnect();
  });

  it('enforces invite TTL (72h), mandatory 2FA, 5-attempt lockout, 30-min idle expiry, and session revocation on deactivate', async () => {
    const t0 = new Date('2026-11-23T12:00:00Z');

    // 1. Invite user (72h expiry)
    const invited = await staffUsersService.invite(
      actorId,
      { email: testEmail, fullName: 'Admin Prueba', role: 'ADMIN', tenantIds: [tenantAId] },
      '127.0.0.1',
      t0,
    );
    const inviteToken = mailer.sent[mailer.sent.length - 1]?.token;
    expect(inviteToken).toBeTruthy();

    // 2. Expired invite (>72h) must fail
    await staffUsersService.invite(
      actorId,
      { email: expiredInviteEmail, fullName: 'Expired User', role: 'GUARD', tenantIds: [tenantAId] },
      '127.0.0.1',
      t0,
    );
    const expiredToken = mailer.sent[mailer.sent.length - 1]?.token ?? '';
    const after73h = new Date(t0.getTime() + 73 * 60 * 60 * 1000);
    await expect(authService.acceptInvite(expiredToken, 'StrongPass123!', {}, after73h)).rejects.toThrow(
      DomainError,
    );

    // 3. Accept valid invite within 72h -> requires 2FA setup
    const accepted = await authService.acceptInvite(inviteToken!, 'StrongPass123!', {}, t0);
    expect(accepted.requires2faSetup).toBe(true);
    const setupPayload = authService.verifyAccessToken(accepted.setupToken);
    expect(setupPayload.scope).toBe('2fa_setup');

    // 4. Login before 2FA is enabled still requires 2FA setup
    const loginPending = await authService.login(
      { email: testEmail, password: 'StrongPass123!' },
      {},
      t0,
    );
    expect(loginPending.requires2faSetup).toBe(true);

    // 5. Setup and confirm TOTP 2FA
    const setup = await authService.setupTotp(invited.id);
    const validCode = totp.generateCode(setup.secret, t0.getTime());
    const confirmed = await authService.confirmTotp(invited.id, validCode, {}, t0);
    expect(confirmed.recoveryCodes).toHaveLength(8);
    expect(confirmed.tokens.accessToken).toBeTruthy();

    // 6. Idle timeout: refresh after 31 minutes fails with SESSION_IDLE_EXPIRED
    const after31Min = new Date(t0.getTime() + 31 * 60 * 1000);
    await expect(
      authService.refresh(confirmed.tokens.refreshToken, {}, after31Min),
    ).rejects.toMatchObject({ code: 'SESSION_IDLE_EXPIRED' });

    // 7. Full login with TOTP succeeds and creates a new active session
    const codeAtT1 = totp.generateCode(setup.secret, after31Min.getTime());
    const loggedIn = await authService.login(
      { email: testEmail, password: 'StrongPass123!', totpCode: codeAtT1 },
      {},
      after31Min,
    );
    expect(loggedIn.tokens?.accessToken).toBeTruthy();

    // 8. Deactivating user immediately revokes active sessions
    await staffUsersService.deactivate(actorId, invited.id, '127.0.0.1', after31Min);
    await expect(
      authService.refresh(loggedIn.tokens!.refreshToken, {}, after31Min),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });

    // 9. Re-activate and test 5 failed login attempts -> 15 min lock
    await staffUsersService.update(actorId, invited.id, { isActive: true }, '127.0.0.1', after31Min);
    for (let i = 0; i < 4; i++) {
      await expect(
        authService.login({ email: testEmail, password: 'WrongPassword!' }, {}, after31Min),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(
      authService.login({ email: testEmail, password: 'WrongPassword!' }, {}, after31Min),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 423 });

    // Even correct password is rejected while locked
    await expect(
      authService.login(
        { email: testEmail, password: 'StrongPass123!', totpCode: codeAtT1 },
        {},
        new Date(after31Min.getTime() + 5 * 60 * 1000),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });
});
