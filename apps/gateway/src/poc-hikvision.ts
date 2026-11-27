import { isForbiddenReaderIp } from './config.js';
import { HikvisionIsapiDevice } from './hikvision-isapi.device.js';
import { normalizeFingerprint } from './reader-transport.js';

/**
 * Interactive PoC script to validate Hikvision DS-K1T344EBFWX-E1 on-site (P1-P9).
 *
 * Usage:
 *   HIKVISION_IP=192.168.1.64 HIKVISION_USER=usuario HIKVISION_PASS=TuClave \
 *     [HIKVISION_PROTOCOL=https HIKVISION_TLS_FINGERPRINT=AB:CD:...] \
 *     pnpm --filter @noah/gateway poc:hikvision
 *
 * Flags:
 *   --open     Also tests remote door opening (P9)
 *   --cleanup  Deletes the temporary NX0001POC user right after testing (P6)
 */
async function main() {
  const ip = process.env['HIKVISION_IP'];
  const username = process.env['HIKVISION_USER'] ?? '';
  const password = process.env['HIKVISION_PASS'] || '';
  const protocol = process.env['HIKVISION_PROTOCOL'] === 'https' ? 'https' : 'http';
  const port = Number(process.env['HIKVISION_PORT'] || (protocol === 'https' ? 443 : 80));
  const doorNo = Number(process.env['HIKVISION_DOOR_NO'] || 1);

  if (!ip || !username) {
    console.error('Faltan HIKVISION_IP y/o HIKVISION_USER. Ejemplo:');
    console.error(
      '  HIKVISION_IP=192.168.1.64 HIKVISION_USER=usuario HIKVISION_PASS=xxx pnpm --filter @noah/gateway poc:hikvision',
    );
    process.exit(1);
  }
  if (isForbiddenReaderIp(ip)) {
    console.error(
      `HIKVISION_IP=${ip} no es una IP válida de lector (loopback/link-local/no-IP no permitidos).`,
    );
    process.exit(1);
  }
  const fpRaw = process.env['HIKVISION_TLS_FINGERPRINT'];
  const fingerprint256 = fpRaw ? normalizeFingerprint(fpRaw) : undefined;
  if (fpRaw && !fingerprint256) {
    console.error('HIKVISION_TLS_FINGERPRINT no es una huella SHA-256 válida.');
    process.exit(1);
  }

  const device = new HikvisionIsapiDevice({
    protocol,
    ip,
    port,
    credentials: { username, password },
    employeePrefix: 'NX',
    ...(fingerprint256 ? { tls: { fingerprint256 } } : {}),
  });

  console.log(`\n1) Consultando estado de ${protocol}://${ip}:${port}...`);
  const status = await device.getStatus({ detailed: true });
  console.log('   Estado:', status);
  if (!status.online) {
    console.error(
      '   El lector no respondió por ISAPI. Revisa IP, puerto, red o credenciales Digest.',
    );
    process.exit(1);
  }

  const employeeNo = 'NX0001POC';
  const cardNo = '1234567890';
  const now = new Date();
  const validFrom = new Date(now.getTime() - 60_000);
  const validTo = new Date(now.getTime() + 10 * 60_000);

  console.log(
    `\n2) Creando credencial temporal ${employeeNo} (cardNo=${cardNo}) vigente 10 minutos...`,
  );
  await device.upsertCredential({
    employeeNo,
    cardNo,
    name: 'QR Prueba NOAH',
    validFrom,
    validTo,
    doorNo,
  });
  console.log(
    '   OK! Presenta un QR con el texto plano "1234567890" frente a la cámara del lector.',
  );

  if (process.argv.includes('--open')) {
    console.log(`\n3) Probando apertura remota en puerta ${doorNo}...`);
    await device.openDoor(doorNo);
    console.log('   OK! Orden de apertura enviada.');
  }

  if (process.argv.includes('--cleanup')) {
    console.log(`\n4) Revocando usuario temporal ${employeeNo}...`);
    await device.revokeCredential(employeeNo);
    console.log('   OK! Usuario temporal eliminado (tags de residentes intactos).');
  } else {
    console.log('\nPara revocar este usuario de prueba luego, ejecuta con --cleanup.');
  }
}

void main();
