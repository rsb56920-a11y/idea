@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-vcclient.ps1"
if errorlevel 1 (
  echo.
  echo [NG] Please take a screenshot of the error above and send it.
)
echo.
pause
