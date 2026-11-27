#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala NOAH Edge Gateway como tarea de inicio automático en Windows (corre 24/7 como SYSTEM).
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
  Write-Host "Edita $envPath con GATEWAY_API_URL, GATEWAY_API_TOKEN y HIKVISION_PASS, y vuelve a ejecutar este script." -ForegroundColor Yellow
  notepad.exe $envPath
  exit 0
}

$envContent = Get-Content $envPath -Raw
if ($envContent -match "CAMBIAR_POR_") {
  Write-Error "El archivo .env todavia tiene valores de ejemplo (CAMBIAR_POR_*). Editalo antes de instalar el servicio."
  exit 1
}

# 3. Crear carpeta de logs
$logsDir = Join-Path $InstallDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

# 4. Registrar tarea programada (arranca con Windows sin iniciar sesion y reinicia en fallo)
$runnerCmd = Join-Path $InstallDir "run-gateway.cmd"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$runnerCmd`"" -WorkingDirectory $InstallDir
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
