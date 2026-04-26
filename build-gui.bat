@echo off
REM Brox Scraper GUI build helper for Windows

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Brox Scraper GUI Builder
echo ============================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

echo [OK] Node.js found
node --version
echo.

npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed.
    pause
    exit /b 1
)

echo [OK] npm found
npm --version
echo.

echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

if not exist assets (
    echo [2/4] Creating assets folder...
    mkdir assets
    if errorlevel 1 (
        echo [ERROR] Could not create assets folder.
        pause
        exit /b 1
    )
) else (
    echo [2/4] Assets folder already exists
)
echo [OK] Assets folder ready
echo.

if not exist assets\icon.png (
    echo [2.5/4] Icon missing, generating assets\icon.png...
    call generate-icon.bat
    if errorlevel 1 (
        echo [ERROR] Icon generation failed.
        pause
        exit /b 1
    )
    echo [OK] Icon generated
) else (
    echo [2.5/4] Icon already exists
)
echo.

echo [3/4] Building Electron app...
call npm run build:gui
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build complete
echo.

echo [4/4] Output files:
echo ============================================
if exist dist (
    pushd dist
    for %%F in (*.exe) do (
        echo   - %%F
    )
    popd
) else (
    echo [ERROR] dist folder not found.
)
echo ============================================
echo.
pause
