#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script con sudo: sudo ./install-macos.sh" >&2
  exit 1
fi

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.noah.gateway"
PLIST_FILE="/Library/LaunchDaemons/${LABEL}.plist"
NODE_BIN="$(command -v node || true)"

if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: No se encontro Node.js en PATH. Instala Node.js 22 LTS." >&2
  exit 1
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
  echo "Se creo ${INSTALL_DIR}/.env. Editalo con los valores reales y vuelve a ejecutar sudo ./install-macos.sh"
  exit 0
fi

mkdir -p "${INSTALL_DIR}/logs"

cat > "${PLIST_FILE}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>--env-file=${INSTALL_DIR}/.env</string>
    <string>${INSTALL_DIR}/dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${INSTALL_DIR}/logs/gateway.log</string>
  <key>StandardErrorPath</key>
  <string>${INSTALL_DIR}/logs/gateway.err.log</string>
</dict>
</plist>
EOF

launchctl bootout system "${PLIST_FILE}" 2>/dev/null || true
launchctl bootstrap system "${PLIST_FILE}"
echo "[LISTO] Servicio ${LABEL} instalado e iniciado."
echo "Ver logs: tail -f ${INSTALL_DIR}/logs/gateway.log"
