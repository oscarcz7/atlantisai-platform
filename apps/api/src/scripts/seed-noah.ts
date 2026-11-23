import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  type BuildingConfigImportJson,
  TenantsService,
} from '../modules/tenants/tenants.service.js';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const configPath = resolve(process.cwd(), '../../seed/noah.config.json');
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as BuildingConfigImportJson;

    const tenantsService = new TenantsService(prisma);
    const summary = await tenantsService.importConfig(parsed, 'system');
    process.stdout.write(
      `Seed completado (${summary.name}): ${summary.unitTypes} tipologías, ${summary.amenities} áreas, ${summary.cleaningCombos} combos.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
