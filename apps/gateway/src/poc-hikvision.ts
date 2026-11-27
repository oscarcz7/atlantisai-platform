import { HikvisionIsapiDevice } from './hikvision-isapi.device.js';

/**
 * Interactive PoC script to validate Hikvision DS-K1T344EBFWX-E1 on-site (P1-P9).
 *
 * Usage:
 *   HIKVISION_IP=192.168.1.64 HIKVISION_USER=admin HIKVISION_PASS=TuClave \
 *     pnpm --filter @noah/gateway poc:hikvision
 *
 * Flags:
 *   --open     Also tests remote door opening (P9)
 *   --cleanup  Deletes the temporary NX0001POC user right after testing (P6)
 */
async function main() {
  const ip = process.env['HIKVISION_IP'];
  const username = process.env['HIKVISION_USER'] || 'admin';
  const password = process.env['HIKVISION_PASS'] || '';
  const protocol = process.env['HIKVISION_PROTOCOL'] === 'https' ? 'https' : 'http';
  const port = Number(process.env['HIKVISION_PORT'] || (protocol === 'https' ? 443 : 80));
  const doorNo = Number(process.env['HIKVISION_DOOR_NO'] || 1);

  if (!ip) {
    console.error('Falta HIKVISION_IP. Ejemplo:');
    console.error('  HIKVISION_IP=192.168.1.64 HIKVISION_USER=admin HIKVISION_PASS=xxx pnpm --filter @noah/gateway poc:hikvision');
    process.exit(1);
  }

  const device = new HikvisionIsapiDevice({
    protocol,
    ip,
    port,
    credentials: { username, password },
    employeePrefix: 'NX',
  });

  console.log(`\n1) Consultando estado de ${protocol}://${ip}:${port}...`);
  const status = await device.getStatus();
  console.log('   Estado:', status);
  if (!status.online) {
    console.error('   El lector no respondió por ISAPI. Revisa IP, puerto, red o credenciales Digest.');
    process.exit(1);
  }

  const employeeNo = 'NX0001POC';
  const cardNo = '1234567890';
  const now = new Date();
  const validFrom = new Date(now.getTime() - 60_000);
  const validTo = new Date(now.getTime() + 10 * 60_000);

  console.log(`\n2) Creando credencial temporal ${employeeNo} (cardNo=${cardNo}) vigente 10 minutos...`);
  await device.upsertCredential({
    employeeNo,
    cardNo,
    name: 'QR Prueba NOAH',
    validFrom,
    validTo,
    doorNo,
  });
  console.log('   OK! Presenta un QR con el texto plano "1234567890" frente a la cámara del lector.');

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
