@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 18+ from https://nodejs.org/
  pause
  exit /b 1
)
node server.js
pause
