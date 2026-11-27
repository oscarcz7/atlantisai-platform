/**
 * One-off migration: recomputes national ID hashes with the keyed HMAC and re-masks
 * national IDs (last 4 digits only) for persons and visits, tenant by tenant (RLS-safe).
 * Idempotent: safe to run several times. Never prints personal data.
 *
 *   pnpm --filter @noah/api rehash:national-ids
 */
import { maskNationalId } from '@noah/domain';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { FieldEncryptionService } from '../modules/auth/crypto/field-encryption.service.js';

async function main() {
  const prisma = new PrismaService();
  const encryption = new FieldEncryptionService();
  await prisma.$connect();
  let persons = 0;
  let visits = 0;
  let failures = 0;
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const { id: tenantId } of tenants) {
      const ctx = { tenantId, actorType: 'SYSTEM', actorId: 'rehash-national-ids', channel: 'SYSTEM' } as const;
      await prisma.withTenant(
        ctx,
        async (tx) => {
          const rows = await tx.person.findMany({
            where: { tenantId },
            select: { id: true, nationalIdEnc: true, nationalIdHash: true, nationalIdMask: true },
          });
          for (const r of rows) {
            try {
              const clear = encryption.decrypt(r.nationalIdEnc);
              const hash = encryption.hashNationalId(clear);
              const mask = maskNationalId(clear);
              if (hash !== r.nationalIdHash || mask !== r.nationalIdMask) {
                await tx.person.update({ where: { id: r.id }, data: { nationalIdHash: hash, nationalIdMask: mask } });
                persons++;
              }
            } catch {
              failures++;
            }
          }
          const vrows = await tx.visit.findMany({
            where: { tenantId },
            select: { id: true, nationalIdEnc: true, nationalIdMask: true },
          });
          for (const v of vrows) {
            try {
              const mask = maskNationalId(encryption.decrypt(v.nationalIdEnc));
              if (mask !== v.nationalIdMask) {
                await tx.visit.update({ where: { id: v.id }, data: { nationalIdMask: mask } });
                visits++;
              }
            } catch {
              failures++;
            }
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    }
    process.stdout.write(
      `Rehash completado: ${persons} personas y ${visits} visitas actualizadas; ${failures} registros no descifrables.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
