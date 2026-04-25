#!/bin/bash
# Brox Scraper GUI - Build Script for Linux/Mac

set -e

echo ""
echo "============================================"
echo "  Brox Scraper GUI Builder"
echo "============================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js ইনস্টল করা নেই"
    echo "Download: https://nodejs.org/"
    exit 1
fi

echo "[OK] Node.js পাওয়া গেছে"
node --version
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm ইনস্টল করা নেই"
    exit 1
fi

echo "[OK] npm পাওয়া গেছে"
npm --version
echo ""

# Install dependencies
echo "[1/4] ডিপেন্ডেন্সি ইনস্টল করা হচ্ছে..."
npm install
echo "[OK] ডিপেন্ডেন্সি ইনস্টল সম্পন্ন"
echo ""

# Create assets folder if not exists
if [ ! -d "assets" ]; then
    echo "[2/4] assets ফোল্ডার তৈরি করা হচ্ছে..."
    mkdir -p assets
    echo "[OK] assets ফোল্ডার তৈরি হয়েছে"
else
    echo "[2/4] assets ফোল্ডার ইতিমধ্যে বিদ্যমান"
fi
echo ""

# Check if icon exists
if [ ! -f "assets/icon.png" ]; then
    echo "[WARNING] assets/icon.png পাওয়া যায়নি"
    echo "           ডিফল্ট আইকন ব্যবহার করা হবে"
    echo ""
fi

# Build GUI
echo "[3/4] GUI ইনস্টলার বিল্ড করা হচ্ছে..."
echo "        এটি কয়েক মিনিট সময় নিতে পারে..."
echo ""
npm run build:gui
echo "[OK] বিল্ড সম্পন্ন"
echo ""

# Show results
echo "[4/4] ফলাফল:"
echo "============================================"
if [ -d "dist" ]; then
    echo "ইনস্টলেবল ফাইলগুলি dist/ ফোল্ডারে তৈরি হয়েছে:"
    echo ""
    ls -lh dist/*.exe 2>/dev/null || true
fi
echo ""
echo "============================================"
echo "GUI বিল্ড সম্পন্ন!"
echo "ইনস্টলার ফাইল dist/ ফোল্ডারে পাওয়া যাবে।"
echo "============================================"
echo ""
