import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(__dirname, '..');
const distDir = path.join(gatewayDir, 'dist');
const packagingDir = path.join(gatewayDir, 'packaging');
const outDir = path.join(gatewayDir, 'out');
const bundleName = 'noah-gateway';
const bundleDir = path.join(outDir, bundleName);

const pkg = JSON.parse(readFileSync(path.join(gatewayDir, 'package.json'), 'utf8'));

// 1. Limpiar salida previa
rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(bundleDir, 'dist'), { recursive: true });

// 2. Copiar solo archivos JS de runtime (sin tests, .d.ts ni sourcemaps)
const distFiles = readdirSync(distDir);
for (const file of distFiles) {
  if (!file.endsWith('.js') || file.endsWith('.spec.js')) continue;
  cpSync(path.join(distDir, file), path.join(bundleDir, 'dist', file));
}

// 3. Generar package.json mínimo de runtime (cero dependencias)
const runtimePkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: 'module',
  engines: { node: '>=22' },
  scripts: {
    start: 'node --env-file=.env dist/index.js',
    'poc:hikvision': 'node dist/poc-hikvision.js',
  },
};
writeFileSync(path.join(bundleDir, 'package.json'), `${JSON.stringify(runtimePkg, null, 2)}\n`);

// 4. Copiar scripts de instalación, .env.example y README
cpSync(packagingDir, bundleDir, { recursive: true });
for (const file of readdirSync(bundleDir)) {
  if (file.endsWith('.sh')) {
    chmodSync(path.join(bundleDir, file), 0o755);
  }
}

// 5. Generar archivos comprimidos (.zip y .tar.gz)
const zipPath = path.join(outDir, `${bundleName}.zip`);
const tarPath = path.join(outDir, `${bundleName}.tar.gz`);

try {
  execFileSync('zip', ['-rq', zipPath, bundleName], { cwd: outDir, stdio: 'inherit' });
} catch {
  console.warn('[package] Comando "zip" no disponible; se omite .zip');
}

try {
  execFileSync('tar', ['-czf', tarPath, bundleName], { cwd: outDir, stdio: 'inherit' });
} catch {
  console.warn('[package] Comando "tar" no disponible; se omite .tar.gz');
}

console.log(`\n[NOAH Gateway] Empaquetado listo en:`);
console.log(`  Carpeta: ${bundleDir}`);
console.log(`  ZIP:     ${zipPath}`);
console.log(`  TAR.GZ:  ${tarPath}`);
