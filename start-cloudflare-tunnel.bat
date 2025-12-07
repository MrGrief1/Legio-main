@echo off
echo ==========================================
echo   ЗАПУСК CLOUDFLARE TUNNEL ДЛЯ LEGIO
echo ==========================================
echo.

cd C:\cloudflared

echo Запускаю Cloudflare Tunnel...
echo.
echo Ваше приложение будет доступно по адресу:
echo Frontend: https://app.your-domain.com
echo Backend: https://api.your-domain.com
echo.
echo Для остановки нажмите Ctrl+C
echo.

cloudflared.exe tunnel --url http://localhost:3001

pause
