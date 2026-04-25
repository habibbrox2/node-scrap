@echo off
REM System check for Brox Scraper GUI building
REM প্রয়োজনীয় সমস্ত প্রয়োজনীয়তা চেক করুন

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Brox Scraper - System Check
echo ============================================
echo.

set /a pass=0
set /a fail=0

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js পাওয়া যায়নি
    set /a fail=!fail!+1
) else (
    echo [PASS] Node.js installed:
    node --version
    set /a pass=!pass!+1
)
echo.

REM Check npm
echo Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] npm পাওয়া যায়নি
    set /a fail=!fail!+1
) else (
    echo [PASS] npm installed:
    npm --version
    set /a pass=!pass!+1
)
echo.

REM Check if package.json exists
echo Checking project files...
if exist package.json (
    echo [PASS] package.json found
    set /a pass=!pass!+1
) else (
    echo [FAIL] package.json not found
    set /a fail=!fail!+1
)
echo.

REM Check if index.js exists
if exist index.js (
    echo [PASS] index.js found
    set /a pass=!pass!+1
) else (
    echo [FAIL] index.js not found
    set /a fail=!fail!+1
)
echo.

REM Check if electron-main.js exists
if exist electron-main.js (
    echo [PASS] electron-main.js found
    set /a pass=!pass!+1
) else (
    echo [FAIL] electron-main.js not found - GUI files may not be set up correctly
    set /a fail=!fail!+1
)
echo.

REM Check if public folder exists
if exist public (
    echo [PASS] public folder found
    set /a pass=!pass!+1
) else (
    echo [FAIL] public folder not found
    set /a fail=!fail!+1
)
echo.

REM Check if src folder exists
if exist src (
    echo [PASS] src folder found
    set /a pass=!pass!+1
) else (
    echo [FAIL] src folder not found
    set /a fail=!fail!+1
)
echo.

REM Check disk space (basic check)
echo Checking available disk space...
for /f "tokens=3" %%A in ('dir ^| findstr "bytes free"') do (
    echo [INFO] Available space: %%A
)
echo.

REM Summary
echo ============================================
echo   Check Summary
echo ============================================
echo [PASS] %pass% checks passed
echo [FAIL] %fail% checks failed
echo.

if %fail% equ 0 (
    echo ✓ সবকিছু সঠিক আছে!
    echo আপনি 'build-gui.bat' চালাতে প্রস্তুত।
    echo.
) else (
    echo ✗ কিছু সমস্যা পাওয়া গেছে।
    echo উপরের FAIL মেসেজ দেখুন এবং সমাধান করুন।
    echo.
)

echo ============================================
echo.
pause
