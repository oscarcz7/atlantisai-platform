import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnv = resolve(__dirname, '../../.env');
if (!process.env['DATABASE_URL'] && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    testTimeout: 30_000,
  },
});
