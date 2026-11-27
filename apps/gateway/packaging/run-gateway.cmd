@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir logs
echo [%date% %time%] Iniciando NOAH Edge Gateway... >> logs\gateway.log
"node" --env-file=".env" "dist\index.js" >> logs\gateway.log 2>&1
