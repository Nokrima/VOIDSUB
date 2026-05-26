@echo off
color 0B
echo.
echo ==============================================
echo    VoidSub - Guvenli Baslatma Yoneticisi
echo ==============================================
echo.
echo [-] PowerShell yetki kisitlamalari atlatiliyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
pause
