@echo off
setlocal
cd /d "%~dp0"
rem Ruta absoluta de node.exe pasada por el instalador (evita depender del PATH).
set "NODE_EXE=%~1"
if "%NODE_EXE%"=="" set "NODE_EXE=node"
if not exist "logs" mkdir logs
echo [%date% %time%] Iniciando NOAH Edge Gateway... >> logs\gateway.log
"%NODE_EXE%" --env-file=".env" "dist\index.js" >> logs\gateway.log 2>&1
