import { randomBytes } from 'node:crypto';
import { generateUuidV7 } from '@noah/domain';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

/**
 * LOCAL DEVELOPMENT ONLY. For real environments use `pnpm --filter @noah/api staff:create`.
 * Without SEED_ADMIN_PASSWORD a random password is generated and printed once.
 */
async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('seed-admin es solo para desarrollo local. Usa staff:create en producción.');
  }
  const prisma = new PrismaClient();
  const email = (process.env['SEED_ADMIN_EMAIL'] ?? 'admin@edificionoah.com').toLowerCase();
  const generated = !process.env['SEED_ADMIN_PASSWORD'];
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? randomBytes(18).toString('base64url');
  const fullName = process.env['SEED_ADMIN_NAME'] ?? 'SuperAdmin NOAH';

  const tenant = await prisma.tenant.upsert({
    where: { code: 'noah' },
    update: {},
    create: {
      id: generateUuidV7(),
      code: 'noah',
      name: 'Edificio NOAH',
      timezone: 'America/Guayaquil',
    },
  });

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  // The building admin gets its own password (accounts must never share credentials).
  const bldgPassword = randomBytes(18).toString('base64url');
  const bldgPasswordHash = await argon2.hash(bldgPassword, { type: argon2.argon2id });
  const existing = await prisma.staffUser.findUnique({ where: { email } });

  if (!existing) {
    await prisma.staffUser.create({
      data: {
        id: generateUuidV7(),
        email,
        fullName,
        passwordHash,
        role: 'SUPERADMIN',
        isActive: true,
        tenants: { create: [{ tenantId: tenant.id }] },
      },
    });
    process.stdout.write(
      `SuperAdmin creado: ${email} (Edificio: ${tenant.name})${generated ? ` · contraseña: ${password}` : ''}\n`,
    );
  } else {
    process.stdout.write(`SuperAdmin ya existe: ${email}\n`);
  }

  // Also seed a building ADMIN account for Edificio NOAH so both worlds can be tested out of the box
  const bldgAdminEmail = 'administrador@edificionoah.com';
  const existingBldgAdmin = await prisma.staffUser.findUnique({ where: { email: bldgAdminEmail } });
  if (!existingBldgAdmin) {
    await prisma.staffUser.create({
      data: {
        id: generateUuidV7(),
        email: bldgAdminEmail,
        fullName: 'Administrador NOAH',
        passwordHash: bldgPasswordHash,
        role: 'ADMIN',
        isActive: true,
        tenants: { create: [{ tenantId: tenant.id }] },
      },
    });
    process.stdout.write(
      `Administrador creado: ${bldgAdminEmail} (Edificio: ${tenant.name}) · contraseña: ${bldgPassword}\n`,
    );
  } else {
    process.stdout.write(`Administrador ya existe: ${bldgAdminEmail}\n`);
  }

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
