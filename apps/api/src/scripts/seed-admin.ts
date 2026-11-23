import { generateUuidV7 } from '@noah/domain';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const email = (process.env['SEED_ADMIN_EMAIL'] ?? 'admin@edificionoah.com').toLowerCase();
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'NoahAdmin2026!';
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
    process.stdout.write(`SuperAdmin creado: ${email} (Edificio: ${tenant.name})\n`);
  } else {
    process.stdout.write(`SuperAdmin ya existe: ${email}\n`);
  }

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
