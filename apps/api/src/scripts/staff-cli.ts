/**
 * Staff account administration (decided: staff onboarding is script-only, no e-mail).
 *
 *   pnpm --filter @noah/api staff:create -- --email ana@x.com --name "Ana Pérez" --role ADMIN --tenant noah [--tenant otro]
 *   pnpm --filter @noah/api staff:reset-2fa -- --email ana@x.com
 *   pnpm --filter @noah/api staff:reset-password -- --email ana@x.com
 *
 * A strong temporary password is generated and printed ONCE to this terminal (never logged
 * elsewhere). On first login the user must enrol 2FA (mandatory). Every action is recorded in
 * staff_auth_audits with actor "cli".
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { generateUuidV7 } from '@noah/domain';

const ROLES = ['SUPERADMIN', 'ADMIN', 'ACCOUNTANT', 'GUARD'] as const;
type Role = (typeof ROLES)[number];

function tempPassword(): string {
  // 18 random bytes → 24 base64url chars (~144 bits); satisfies the 10–128 length rule.
  return randomBytes(18).toString('base64url');
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

async function audit(prisma: PrismaClient, staffUserId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.staffAuthAudit.create({
    data: { id: generateUuidV7(), staffUserId, actorId: null, action, metadata: { ...metadata, actor: 'cli' } },
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      tenant: { type: 'string', multiple: true },
    },
    strict: true,
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('--email válido es obligatorio');

  const prisma = new PrismaClient();
  try {
    if (command === 'create') {
      const role = values.role?.toUpperCase() as Role | undefined;
      if (!role || !ROLES.includes(role)) fail(`--role debe ser uno de ${ROLES.join(', ')}`);
      const fullName = values.name?.trim();
      if (!fullName) fail('--name es obligatorio');
      const codes = (values.tenant ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (role !== 'SUPERADMIN' && codes.length === 0) fail('--tenant es obligatorio para roles de edificio');
      const tenants = await prisma.tenant.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
      const missing = codes.filter((c) => !tenants.some((t) => t.code === c));
      if (missing.length) fail(`edificio(s) no encontrado(s): ${missing.join(', ')}`);
      if (await prisma.staffUser.findUnique({ where: { email } })) fail('ya existe un usuario con ese correo');

      const password = tempPassword();
      const user = await prisma.staffUser.create({
        data: {
          id: generateUuidV7(),
          email,
          fullName,
          role,
          isActive: true,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          tenants: { create: tenants.map((t) => ({ tenantId: t.id })) },
        },
      });
      await audit(prisma, user.id, 'STAFF_CREATED_CLI', { role, tenants: codes });
      process.stdout.write(
        `Usuario creado: ${email} (${role}${codes.length ? ` · ${codes.join(', ')}` : ''})\n` +
          `Contraseña temporal (se muestra una sola vez): ${password}\n` +
          `En el primer ingreso deberá configurar la verificación en dos pasos. Entrégala por un canal seguro.\n`,
      );
    } else if (command === 'reset-2fa') {
      const user = await prisma.staffUser.findUnique({ where: { email } });
      if (!user) fail('usuario no encontrado');
      await prisma.$transaction([
        prisma.staffUser.update({
          where: { id: user.id },
          data: { totpEnabled: false, totpSecretEnc: null, totpLastCounter: null },
        }),
        prisma.staffRecoveryCode.deleteMany({ where: { staffUserId: user.id } }),
        prisma.staffSession.updateMany({ where: { staffUserId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await audit(prisma, user.id, 'TOTP_RESET_CLI', {});
      process.stdout.write(`2FA restablecida para ${email}. Sesiones cerradas; deberá configurarla en su próximo ingreso.\n`);
    } else if (command === 'reset-password') {
      const user = await prisma.staffUser.findUnique({ where: { email } });
      if (!user) fail('usuario no encontrado');
      const password = tempPassword();
      await prisma.$transaction([
        prisma.staffUser.update({
          where: { id: user.id },
          data: {
            passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        }),
        prisma.staffSession.updateMany({ where: { staffUserId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await audit(prisma, user.id, 'PASSWORD_RESET_CLI', {});
      process.stdout.write(`Contraseña temporal para ${email} (se muestra una sola vez): ${password}\n`);
    } else {
      fail('comando desconocido. Usa: create | reset-2fa | reset-password');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
