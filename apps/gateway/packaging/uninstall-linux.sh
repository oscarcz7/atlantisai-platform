#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script con sudo: sudo ./uninstall-linux.sh" >&2
  exit 1
fi

SERVICE_NAME="noah-gateway"
systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
echo "[OK] Servicio ${SERVICE_NAME} desinstalado."
