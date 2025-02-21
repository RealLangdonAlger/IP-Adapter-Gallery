@echo off
cd /d "%~dp0"
start "IP Adapter Gallery" /min cmd /k "node server.js"
TIMEOUT /T 3 >nul
start "" http://localhost:3000
