@echo off
REM Brox Scraper GUI - Build Script
REM এটি Electron GUI অ্যাপ বিল্ড করে এবং ইনস্টলার তৈরি করে

setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Brox Scraper GUI Builder
echo ============================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js ইনস্টল করা নেই। দয়া করে Node.js ইনস্টল করুন।
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js পাওয়া গেছে
node --version
echo.

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm ইনস্টল করা নেই
    pause
    exit /b 1
)

echo [OK] npm পাওয়া গেছে
npm --version
echo.

REM Install dependencies
echo [1/4] ডিপেন্ডেন্সি ইনস্টল করা হচ্ছে...
call npm install
if errorlevel 1 (
    echo [ERROR] ডিপেন্ডেন্সি ইনস্টলেশন ব্যর্থ হয়েছে
    pause
    exit /b 1
)
echo [OK] ডিপেন্ডেন্সি ইনস্টল সম্পন্ন
echo.

REM Create assets folder if not exists
if not exist assets (
    echo [2/4] assets ফোল্ডার তৈরি করা হচ্ছে...
    mkdir assets
    echo [OK] assets ফোল্ডার তৈরি হয়েছে
) else (
    echo [2/4] assets ফোল্ডার ইতিমধ্যে বিদ্যমান
)
echo.

REM Check if icon exists
if not exist assets\icon.png (
    echo [WARNING] assets\icon.png পাওয়া যায়নি
    echo           ডিফল্ট আইকন ব্যবহার করা হবে
    echo.
)

REM Build GUI
echo [3/4] GUI ইনস্টলার বিল্ড করা হচ্ছে...
echo        এটি কয়েক মিনিট সময় নিতে পারে...
echo.
call npm run build:gui
if errorlevel 1 (
    echo [ERROR] বিল্ড প্রক্রিয়া ব্যর্থ হয়েছে
    pause
    exit /b 1
)
echo [OK] বিল্ড সম্পন্ন
echo.

REM Show results
echo [4/4] ফলাফল:
echo ============================================
if exist dist (
    cd dist
    echo ইনস্টলেবল ফাইলগুলি dist\ ফোল্ডারে তৈরি হয়েছে:
    echo.
    for %%F in (*.exe) do (
        echo   - %%F
    )
    cd ..
) else (
    echo [ERROR] dist ফোল্ডার পাওয়া যায়নি
)
echo.
echo ============================================
echo GUI বিল্ড সম্পন্ন!
echo ইনস্টলার ফাইল dist\ ফোল্ডারে পাওয়া যাবে।
echo ============================================
echo.
pause
