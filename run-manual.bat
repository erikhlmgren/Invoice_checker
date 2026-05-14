@echo off
cd /d "%~dp0"
echo Invoice Checker — Manual Run
echo.
echo Options:
echo   1. Full run (download from Synologen + price check + email)
echo   2. Offline run (use local files from config.json localFiles)
echo.
set /p choice="Enter 1 or 2: "

if "%choice%"=="2" (
    echo Running in offline mode...
    node src/main.js --offline
) else (
    echo Running full scraper mode ^(downloads from Synologen^)...
    node src/main.js
)

if %errorlevel% neq 0 (
    echo.
    echo Run failed. Check logs\run.log for details.
) else (
    echo.
    echo Run complete. Check output\results.xlsx for results.
)
pause
