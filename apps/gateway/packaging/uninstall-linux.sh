#!/usr/bin/env bash
# Uso: sudo ./uninstall-linux.sh [--purge]
#   --purge  además borra /opt/noah-gateway (incluido .env), /var/lib/noah-gateway y el usuario noah-gateway.
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

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf /opt/noah-gateway /var/lib/noah-gateway
  if id -u noah-gateway >/dev/null 2>&1; then userdel noah-gateway || true; fi
  if getent group noah-gateway >/dev/null; then groupdel noah-gateway 2>/dev/null || true; fi
  echo "[OK] Archivos, estado y usuario noah-gateway eliminados."
else
  echo "Se conservan /opt/noah-gateway (con .env) y el usuario noah-gateway. Usa --purge para borrarlos."
fi
