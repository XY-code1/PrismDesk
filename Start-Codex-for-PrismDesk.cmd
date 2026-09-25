@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-codex-cdp.ps1"
if errorlevel 1 (
  echo.
  echo PrismDesk could not start Codex with the verified loopback endpoint.
  pause
)
