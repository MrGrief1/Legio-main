@echo off
echo ==========================================
echo   ЗАПУСК BACKEND СЕРВЕРА LEGIO
echo ==========================================
echo.

cd /d "c:\Users\msi\OneDrive\Рабочий стол\Legio\server"

echo Запускаю сервер на порту 3001...
echo Сервер будет доступен по адресу: http://0.0.0.0:3001
echo.
echo Для остановки нажмите Ctrl+C
echo.

node index.js

pause
