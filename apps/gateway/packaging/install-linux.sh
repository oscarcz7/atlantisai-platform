#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script con sudo: sudo ./install-linux.sh" >&2
  exit 1
fi

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="noah-gateway"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: No se encontro Node.js. Instala Node.js 22 LTS y reintenta." >&2
  exit 1
fi

NODE_MAJOR="$("${NODE_BIN}" -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Error: Se requiere Node.js >= 22 (detectado $("${NODE_BIN}" -v))." >&2
  exit 1
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
  echo "Se creo ${INSTALL_DIR}/.env. Editalo con los valores reales y vuelve a ejecutar sudo ./install-linux.sh"
  exit 0
fi

if grep -q "CAMBIAR_POR_" "${INSTALL_DIR}/.env"; then
  echo "Error: ${INSTALL_DIR}/.env todavia contiene valores de ejemplo (CAMBIAR_POR_*)." >&2
  exit 1
fi

chmod 600 "${INSTALL_DIR}/.env"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=NOAH Edge Gateway (Hikvision)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${NODE_BIN} ${INSTALL_DIR}/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo ""
echo "[LISTO] Servicio ${SERVICE_NAME} instalado e iniciado."
echo "Ver estado:  sudo systemctl status ${SERVICE_NAME}"
echo "Ver logs:    sudo journalctl -u ${SERVICE_NAME} -f"
