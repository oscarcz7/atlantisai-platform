#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala NOAH Edge Gateway como tarea de inicio automático en Windows (corre 24/7 como SYSTEM).
.NOTES
  Cuenta de ejecución: se mantiene SYSTEM porque el Programador de tareas no admite cuentas
  virtuales (NT SERVICE\...) y una cuenta local dedicada exige gestionar su contraseña.
  Para compensar, el instalador:
    - Restringe la carpeta de instalación: SYSTEM y Administradores control total; Usuarios solo
      lectura/ejecución (evita que un usuario sin privilegios reemplace dist\*.js y ejecute código como SYSTEM).
    - Restringe .env y readers.json a SYSTEM (lectura) y Administradores (control total).
    - Invoca node.exe por ruta absoluta (no depende del PATH).
  Recomendado en producción: usar Linux (install-linux.sh), que corre con usuario dedicado y systemd endurecido.
.USAGE
  Clic derecho en PowerShell -> "Ejecutar como administrador":
    cd C:\noah-gateway
    powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
#>

$ErrorActionPreference = "Stop"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "NoahEdgeGateway"

Write-Host "=== Instalador NOAH Edge Gateway (Windows) ===" -ForegroundColor Cyan

# 1. Verificar Node.js >= 22
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "No se encontro Node.js en el PATH. Instala Node.js 22 LTS desde https://nodejs.org y vuelve a ejecutar."
  exit 1
}

$nodeVersionRaw = (& node -v).Trim()
$nodeMajor = [int]($nodeVersionRaw.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  Write-Error "Se requiere Node.js >= 22 (detectado $nodeVersionRaw). Actualiza Node.js 22 LTS."
  exit 1
}
Write-Host "[OK] Node.js $nodeVersionRaw detectado en $($nodeCmd.Source)" -ForegroundColor Green

# 2. Verificar .env
$envPath = Join-Path $InstallDir ".env"
$envExamplePath = Join-Path $InstallDir ".env.example"
if (-not (Test-Path $envPath)) {
  Copy-Item $envExamplePath $envPath
  Write-Host "[ACCION REQUERIDA] Se creo $envPath a partir de .env.example." -ForegroundColor Yellow
  Write-Host "Edita $envPath con GATEWAY_API_URL, GATEWAY_API_TOKEN, HIKVISION_USER, HIKVISION_PASS y GATEWAY_READER_ALLOWLIST, y vuelve a ejecutar este script." -ForegroundColor Yellow
  notepad.exe $envPath
  exit 0
}

$envContent = Get-Content $envPath -Raw
if ($envContent -match "CAMBIAR_POR_") {
  Write-Error "El archivo .env todavia tiene valores de ejemplo (CAMBIAR_POR_*). Editalo antes de instalar el servicio."
  exit 1
}

function Get-EnvValue([string]$name) {
  $line = (Get-Content $envPath | Where-Object { $_ -match "^\s*$name=" } | Select-Object -Last 1)
  if (-not $line) { return "" }
  return ($line -replace "^\s*$name=", "").Trim().Trim('"').Trim("'")
}

if ((Get-EnvValue "GATEWAY_MODE").ToLower() -eq "hikvision") {
  if (-not (Get-EnvValue "GATEWAY_READER_ALLOWLIST") -and -not (Get-EnvValue "GATEWAY_READERS_FILE")) {
    Write-Error "En modo hikvision debes definir GATEWAY_READER_ALLOWLIST y/o GATEWAY_READERS_FILE en .env."
    exit 1
  }
  if (-not (Get-EnvValue "HIKVISION_USER")) {
    Write-Error "HIKVISION_USER es obligatorio en modo hikvision."
    exit 1
  }
}

$nodeExe = (Resolve-Path $nodeCmd.Source).Path
if ($nodeExe -like "$env:SystemDrive\Users\*") {
  Write-Warning "node.exe esta en una carpeta de usuario ($nodeExe). Se ejecutara como SYSTEM: instala Node.js para todos los usuarios en Program Files."
}

# 3. Crear carpeta de logs
$logsDir = Join-Path $InstallDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

# 3b. Permisos (SIDs para no depender del idioma de Windows):
#   S-1-5-18 = SYSTEM, S-1-5-32-544 = Administradores, S-1-5-32-545 = Usuarios
& icacls $InstallDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" /T /C /Q | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "No se pudieron aplicar permisos a $InstallDir"; exit 1 }

$secretFiles = @($envPath)
$readersPath = Join-Path $InstallDir "readers.json"
if (Test-Path $readersPath) { $secretFiles += $readersPath }
$customReaders = Get-EnvValue "GATEWAY_READERS_FILE"
if ($customReaders -and (Test-Path $customReaders)) { $secretFiles += (Resolve-Path $customReaders).Path }
foreach ($secret in ($secretFiles | Select-Object -Unique)) {
  & icacls $secret /inheritance:r /grant:r "*S-1-5-18:(R)" "*S-1-5-32-544:(F)" /C /Q | Out-Null
  & icacls $secret /remove:g "*S-1-5-32-545" "*S-1-5-11" "*S-1-1-0" /C /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Error "No se pudieron restringir permisos de $secret"; exit 1 }
  Write-Host "[OK] Permisos restringidos (SYSTEM lectura, Administradores): $secret" -ForegroundColor Green
}

# 4. Registrar tarea programada (arranca con Windows sin iniciar sesion y reinicia en fallo)
$runnerCmd = Join-Path $InstallDir "run-gateway.cmd"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$runnerCmd`" `"$nodeExe`"`"" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "NOAH Edge Gateway - Sincronizacion de pases QR con lectores Hikvision" | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "[LISTO] Servicio '$TaskName' instalado e iniciado correctamente." -ForegroundColor Green
Write-Host "Para ver los logs en tiempo real ejecuta:" -ForegroundColor Cyan
Write-Host "  Get-Content `"$logsDir\gateway.log`" -Wait -Tail 30"
