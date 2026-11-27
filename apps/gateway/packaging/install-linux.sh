#!/usr/bin/env bash
# Instala NOAH Edge Gateway como servicio systemd endurecido.
# - Código en /opt/noah-gateway (propiedad de root, solo lectura para el servicio).
# - Servicio corre como usuario sin privilegios "noah-gateway" (creado si no existe).
# - .env (y readers.json) legibles solo por root y el grupo noah-gateway (640).
# - Estado persistente (cola local futura) en /var/lib/noah-gateway.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script con sudo: sudo ./install-linux.sh" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/noah-gateway"
STATE_DIR="/var/lib/noah-gateway"
SERVICE_NAME="noah-gateway"
SERVICE_USER="noah-gateway"
SERVICE_GROUP="noah-gateway"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: No se encontro Node.js. Instala Node.js 22 LTS y reintenta." >&2
  exit 1
fi
NODE_BIN="$(readlink -f "${NODE_BIN}")"
case "${NODE_BIN}" in
  /home/*|/root/*|/tmp/*)
    echo "Error: Node.js esta en ${NODE_BIN} (nvm/usuario). El servicio usa ProtectHome y no puede ejecutarlo." >&2
    echo "Instala Node.js 22 a nivel de sistema (paquete de la distro o NodeSource) y reintenta." >&2
    exit 1
    ;;
esac

NODE_MAJOR="$("${NODE_BIN}" -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Error: Se requiere Node.js >= 22 (detectado $("${NODE_BIN}" -v))." >&2
  exit 1
fi

# 1. Usuario y grupo dedicados (sin shell ni home)
if ! getent group "${SERVICE_GROUP}" >/dev/null; then
  groupadd --system "${SERVICE_GROUP}"
fi
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  NOLOGIN="$(command -v nologin || echo /usr/sbin/nologin)"
  useradd --system --gid "${SERVICE_GROUP}" --no-create-home --home-dir /nonexistent \
    --shell "${NOLOGIN}" "${SERVICE_USER}"
fi

# 2. Copiar el paquete a /opt/noah-gateway (root:root, solo lectura para el servicio)
install -d -o root -g root -m 0755 "${INSTALL_DIR}"
if [[ "${SRC_DIR}" != "${INSTALL_DIR}" ]]; then
  rm -rf "${INSTALL_DIR}/dist"
  cp -R "${SRC_DIR}/dist" "${INSTALL_DIR}/dist"
  for f in package.json README.md .env.example uninstall-linux.sh; do
    if [[ -f "${SRC_DIR}/${f}" ]]; then
      install -o root -g root -m 0644 "${SRC_DIR}/${f}" "${INSTALL_DIR}/${f}"
    fi
  done
  chmod 0755 "${INSTALL_DIR}/uninstall-linux.sh" 2>/dev/null || true
fi
chown -R root:root "${INSTALL_DIR}/dist"
find "${INSTALL_DIR}/dist" -type d -exec chmod 0755 {} +
find "${INSTALL_DIR}/dist" -type f -exec chmod 0644 {} +

# 3. Secretos: .env y readers.json (root:noah-gateway 640)
install_secret() {
  local name="$1"
  if [[ ! -f "${INSTALL_DIR}/${name}" && -f "${SRC_DIR}/${name}" && "${SRC_DIR}" != "${INSTALL_DIR}" ]]; then
    install -o root -g "${SERVICE_GROUP}" -m 0640 "${SRC_DIR}/${name}" "${INSTALL_DIR}/${name}"
  fi
  if [[ -f "${INSTALL_DIR}/${name}" ]]; then
    chown root:"${SERVICE_GROUP}" "${INSTALL_DIR}/${name}"
    chmod 0640 "${INSTALL_DIR}/${name}"
  fi
}

install_secret ".env"
install_secret "readers.json"

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  install -o root -g "${SERVICE_GROUP}" -m 0640 "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  echo "Se creo ${INSTALL_DIR}/.env. Editalo (sudo nano ${INSTALL_DIR}/.env) y vuelve a ejecutar sudo ./install-linux.sh"
  exit 0
fi

ENV_FILE="${INSTALL_DIR}/.env"
if grep -q "CAMBIAR_POR_" "${ENV_FILE}"; then
  echo "Error: ${ENV_FILE} todavia contiene valores de ejemplo (CAMBIAR_POR_*)." >&2
  exit 1
fi

env_value() {
  # Último valor no comentado de la variable (sin comillas).
  grep -E "^[[:space:]]*$1=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}

if [[ "$(env_value GATEWAY_MODE | tr '[:upper:]' '[:lower:]')" == "hikvision" ]]; then
  if [[ -z "$(env_value GATEWAY_READER_ALLOWLIST)" && -z "$(env_value GATEWAY_READERS_FILE)" ]]; then
    echo "Error: en modo hikvision debes definir GATEWAY_READER_ALLOWLIST y/o GATEWAY_READERS_FILE en ${ENV_FILE}." >&2
    exit 1
  fi
  if [[ -z "$(env_value HIKVISION_USER)" ]]; then
    echo "Error: HIKVISION_USER es obligatorio en modo hikvision." >&2
    exit 1
  fi
fi

READERS_FILE="$(env_value GATEWAY_READERS_FILE)"
if [[ -n "${READERS_FILE}" && ! -f "${READERS_FILE}" ]]; then
  echo "Error: GATEWAY_READERS_FILE=${READERS_FILE} no existe." >&2
  exit 1
fi

# 4. Directorio de estado (escribible solo por el servicio)
install -d -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" -m 0750 "${STATE_DIR}"

# 5. Unidad systemd endurecida
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=NOAH Edge Gateway (Hikvision)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/dist/index.js
Restart=always
RestartSec=5
UMask=0077

# Estado persistente
StateDirectory=noah-gateway
StateDirectoryMode=0750
ReadWritePaths=${STATE_DIR}

# Endurecimiento
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RemoveIPC=yes
SystemCallArchitectures=native
# Nota: MemoryDenyWriteExecute no se usa porque el JIT de V8 lo necesita.

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo ""
echo "[LISTO] Servicio ${SERVICE_NAME} instalado en ${INSTALL_DIR} (usuario ${SERVICE_USER})."
echo "Configuracion: ${ENV_FILE} (root:${SERVICE_GROUP} 640)"
echo "Ver estado:  sudo systemctl status ${SERVICE_NAME}"
echo "Ver logs:    sudo journalctl -u ${SERVICE_NAME} -f"
echo "Auditoria:   systemd-analyze security ${SERVICE_NAME}"
