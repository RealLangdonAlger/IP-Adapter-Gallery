@echo off
:: Navigate to the script directory
cd /d "%~dp0"

:: Install dependencies
echo Installing dependencies...
call npm install

:: Check if npm install was successful
IF %ERRORLEVEL% NEQ 0 (
    echo Error during npm install. Exiting...
    pause
    exit /b %ERRORLEVEL%
)

:: Start the server in a new command prompt window and keep it running
start "IP Adapter Gallery Server" cmd /k "node server.js"

:: Wait for the server to initialize by using a short timeout
TIMEOUT /T 1 >nul

:: Launch the default browser and open the local application
start "" http://localhost:3000
