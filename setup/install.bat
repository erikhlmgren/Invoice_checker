@echo off
setlocal
cd /d "%~dp0.."

echo ========================================
echo  Invoice Checker - Setup
echo ========================================
echo.

:: Check for Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not found. Downloading and installing...
    echo This may take a few minutes.
    echo.
    powershell -Command "& { $url = 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi'; $out = '%TEMP%\node-installer.msi'; Write-Host 'Downloading Node.js...'; Invoke-WebRequest -Uri $url -OutFile $out; Write-Host 'Installing Node.js...'; Start-Process msiexec.exe -ArgumentList '/i', $out, '/quiet', '/norestart' -Wait; Remove-Item $out }"
    :: Refresh PATH
    call refreshenv >nul 2>&1
    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Node.js installation failed.
        echo Please install Node.js manually from https://nodejs.org and run this script again.
        pause
        exit /b 1
    )
    echo Node.js installed successfully.
) else (
    echo Node.js found:
    node --version
)

echo.
echo Installing dependencies...
call npm install --omit=dev
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)
echo Dependencies installed.

echo.
echo Registering scheduled task...
node setup\setup.js
if %errorlevel% neq 0 (
    echo WARNING: Task Scheduler registration failed.
    echo Try running this script as Administrator (right-click -> Run as administrator).
)

echo.
echo ========================================
echo  Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Copy config.example.json to config.json in this folder
echo   2. Open config.json and fill in:
echo      - Synologen username and password
echo      - Email address and password
echo   3. Copy your PDF price lists to the data\price-lists\ folder
echo   4. Test a manual run by double-clicking: run-manual.bat
echo.
pause
