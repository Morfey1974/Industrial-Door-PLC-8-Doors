@echo off
chcp 65001 >nul
REM Быстрый запуск Vite dev-сервера WebUI (двойной клик или из cmd).
REM Рабочая папка — та, где лежит этот файл (%~dp0).

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo [Ошибка] npm не найден в PATH. Установите Node.js и перезапустите терминал.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [Подсказка] Папки node_modules нет. Один раз выполните: npm install
    echo.
)

echo Запуск: npm run dev
echo Остановка: Ctrl+C
echo.
npm run dev

echo.
pause
