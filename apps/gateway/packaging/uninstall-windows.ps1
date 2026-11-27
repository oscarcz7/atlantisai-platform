#Requires -RunAsAdministrator
$TaskName = "NoahEdgeGateway"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "[OK] Servicio '$TaskName' detenido y desinstalado." -ForegroundColor Green
} else {
  Write-Host "El servicio '$TaskName' no estaba instalado." -ForegroundColor Yellow
}
