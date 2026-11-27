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
   - `GATEWAY_API_TOKEN`: token del gateway de este edificio (dashboard: Acceso → Rotar token del gateway)
   - `HIKVISION_USER` y `HIKVISION_PASS`: credenciales ISAPI del lector Hikvision (obligatorias, sin valor por defecto)
   - `GATEWAY_MODE=hikvision`
   - `GATEWAY_READER_ALLOWLIST` (y/o `GATEWAY_READERS_FILE`): **obligatoria en modo hikvision**. Lista local de
     lectores (`ip[:puerto]`) a los que el gateway puede conectarse. Cualquier comando hacia otro destino se
     rechaza (ack con error) sin tocar la red. Loopback, link-local y `0.0.0.0` nunca se permiten.
   - `GATEWAY_ALLOW_REMOTE_OPEN`: `false` por defecto; los comandos `OPEN_DOOR` de la nube se rechazan
     salvo que lo pongas en `true`.
   - Lectores HTTPS con certificado autofirmado: fija la huella (`fingerprint256`) o la CA (`caFile`) por
     lector en `readers.json`. La verificación TLS nunca se desactiva.

Ver `.env.example` para todas las variables.

> Comandos `PURGE`: este gateway responde `ok:false` ("not implemented") hasta confirmar en la PoC los
> recursos ISAPI de búsqueda/borrado por prefijo. `PING` consulta realmente el lector.

## 3. Probar conexión con el lector Hikvision (antes de instalar el servicio)
Ejecuta la prueba segura (crea usuario temporal `NX0001POC`, abre puerta y limpia):

**Windows (PowerShell):**
```powershell
$env:HIKVISION_IP="192.168.1.64"
$env:HIKVISION_USER="usuario_isapi"
$env:HIKVISION_PASS="TU_CLAVE"
node dist/poc-hikvision.js --open --cleanup
```

**Linux / macOS:**
```bash
HIKVISION_IP=192.168.1.64 HIKVISION_USER=usuario_isapi HIKVISION_PASS=TU_CLAVE \
  node dist/poc-hikvision.js --open --cleanup
```

## 4. Probar el Gateway en consola
```bash
node --env-file=.env dist/index.js
```
Si conecta bien, verás `[NOAH Edge Gateway] Iniciado | mode=hikvision ...`. Presiona `Ctrl+C` para detenerlo.

## 5. Instalar como servicio automático 24/7

### Windows (PowerShell como Administrador)
Corre como `SYSTEM` (el Programador de tareas no admite cuentas virtuales). El instalador restringe la carpeta
(Usuarios solo lectura) y `.env` / `readers.json` (solo SYSTEM y Administradores). Para producción se recomienda Linux.

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
El instalador copia el gateway a `/opt/noah-gateway` (propiedad de root), crea el usuario de sistema
`noah-gateway`, deja `.env` y `readers.json` como `root:noah-gateway 640`, usa `/var/lib/noah-gateway` como
directorio de estado y escribe una unidad systemd endurecida (`NoNewPrivileges`, `ProtectSystem=strict`,
`ProtectHome`, `PrivateTmp`, `RestrictAddressFamilies=AF_INET AF_INET6`, sin capabilities).
Node.js debe estar instalado a nivel de sistema (no nvm en `/home`).
Si actualizas desde una instalación anterior, el `.env` de la carpeta extraída se copia a `/opt/noah-gateway`
la primera vez; después edita siempre `/opt/noah-gateway/.env`.

Ver logs: `sudo journalctl -u noah-gateway -f`
Desinstalar: `sudo ./uninstall-linux.sh` (añade `--purge` para borrar `/opt/noah-gateway`, estado y usuario)

### macOS (`launchd`)
```bash
chmod +x install-macos.sh
sudo ./install-macos.sh
```
Ver logs: `tail -f logs/gateway.log`
