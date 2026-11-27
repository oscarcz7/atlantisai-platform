import { ConfigError, loadConfig, type GatewayConfig } from './config.js';
import { createApiClient, Gateway } from './gateway.js';

function main() {
  let config: GatewayConfig;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    const msg = err instanceof ConfigError ? err.message : String(err);
    console.error(`[NOAH Edge Gateway] Configuración inválida: ${msg}`);
    process.exit(1);
  }

  if (config.mode === 'hikvision' && !config.hikPass) {
    console.warn('[NOAH Edge Gateway] Advertencia: HIKVISION_PASS está vacío.');
  }

  console.log(
    `[NOAH Edge Gateway] Iniciado | mode=${config.mode} | api=${config.apiUrl} | poll=${config.pollMs}ms` +
      ` | heartbeat=${config.heartbeatMs}ms | timeout=${config.httpTimeoutMs}ms` +
      ` | readers=${config.allowlist.length} | remoteOpen=${config.allowRemoteOpen}`,
  );

  // Outbound-only: non-overlapping poll ticks + independent heartbeat timer.
  const gateway = new Gateway(config, createApiClient(config));
  gateway.start();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    gateway.stop();
    console.log(`[NOAH Edge Gateway] Señal ${signal} recibida. Cerrando...`);
    const waitExit = setInterval(() => {
      if (!gateway.isBusy) {
        clearInterval(waitExit);
        process.exit(0);
      }
    }, 100);
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
