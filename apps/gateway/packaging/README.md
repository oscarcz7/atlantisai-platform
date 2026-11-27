# NOAH Edge Gateway — Instalación en la PC del edificio

Este paquete es **autocontenido** (cero dependencias npm). Solo requiere **Node.js 22 LTS** instalado en la computadora que permanece encendida en la red local del edificio.

## 1. Requisitos previos en la PC del edificio
- **Node.js 22 LTS** instalado ([nodejs.org](https://nodejs.org)). Verifica con `node -v`.
- Conectada a la **misma red LAN** que los lectores Hikvision (ej. `192.168.1.x`).
- Acceso a Internet saliente (HTTPS puerto 443) hacia la API de NOAH. No requiere abrir puertos ni VPN.

## 2. Configurar `.env`
1. Copia `.env.example` a `.env`.
2. Edita `.env` con:
   - `GATEWAY_API_URL`: URL pública de tu API (ej. `https://api.edificionoah.com`)
   - `GATEWAY_API_TOKEN`: token secreto configurado en el servidor
   - `HIKVISION_USER` y `HIKVISION_PASS`: credenciales ISAPI del lector Hikvision
   - `GATEWAY_MODE=hikvision`

## 3. Probar conexión con el lector Hikvision (antes de instalar el servicio)
Ejecuta la prueba segura (crea usuario temporal `NX0001POC`, abre puerta y limpia):

**Windows (PowerShell):**
```powershell
$env:HIKVISION_IP="192.168.1.64"
$env:HIKVISION_USER="admin"
$env:HIKVISION_PASS="TU_CLAVE"
node dist/poc-hikvision.js --open --cleanup
```

**Linux / macOS:**
```bash
HIKVISION_IP=192.168.1.64 HIKVISION_USER=admin HIKVISION_PASS=TU_CLAVE \
  node dist/poc-hikvision.js --open --cleanup
```

## 4. Probar el Gateway en consola
```bash
node --env-file=.env dist/index.js
```
Si conecta bien, verás `[NOAH Edge Gateway] Iniciado | mode=hikvision ...`. Presiona `Ctrl+C` para detenerlo.

## 5. Instalar como servicio automático 24/7

### Windows (PowerShell como Administrador)
```powershell
cd C:\noah-gateway
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```
Ver logs: `Get-Content C:\noah-gateway\logs\gateway.log -Wait -Tail 30`
Desinstalar: `powershell -ExecutionPolicy Bypass -File .\uninstall-windows.ps1`

### Linux / Raspberry Pi (`systemd`)
```bash
chmod +x install-linux.sh uninstall-linux.sh
sudo ./install-linux.sh
```
Ver logs: `sudo journalctl -u noah-gateway -f`
Desinstalar: `sudo ./uninstall-linux.sh`

### macOS (`launchd`)
```bash
chmod +x install-macos.sh
sudo ./install-macos.sh
```
Ver logs: `tail -f logs/gateway.log`
