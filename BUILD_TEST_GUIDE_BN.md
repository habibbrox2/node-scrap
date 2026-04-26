# Brox Scraper - Build এবং Update Feature গাইড

## 📋 বিষয়বস্তু
1. [আপডেট ফিচার পরিচয়](#আপডেট-ফিচার-পরিচয়)
2. [প্রয়োজনীয় সেটআপ](#প্রয়োজনীয়-সেটআপ)
3. [Build করার ধাপসমূহ](#build-করার-ধাপসমূহ)
4. [টেস্টিং গাইড](#টেস্টিং-গাইড)
5. [আপডেট সার্ভার সেটআপ](#আপডেট-সার্ভার-সেটআপ)

---

## আপডেট ফিচার পরিচয়

### কী যোগ করা হয়েছে?
- **Electron-Updater Integration**: স্বয়ংক্রিয় আপডেট চেক এবং ইনস্টলেশন
- **মেনু অপশন**: "আপডেট চেক করুন" মেনু আইটেম
- **ব্যবহারকারী বিজ্ঞপ্তি**: নতুন আপডেট পাওয়া গেলে স্বয়ংক্রিয় বিজ্ঞপ্তি
- **আপডেট ডায়ালগ**: ডাউনলোড এবং ইনস্টলেশন স্ট্যাটাস দেখার সুবিধা

### ফিচার বিবরণ
```
✓ অ্যাপ শুরু হলে স্বয়ংক্রিয় আপডেট চেক
✓ ব্যবহারকারী যেকোনো সময় ম্যানুয়াল চেক করতে পারবেন
✓ নতুন ভার্সন পাওয়া গেলে স্বয়ংক্রিয় ডাউনলোড
✓ ডাউনলোড সম্পন্ন হলে সরাসরি ইনস্টল অপশন
✓ এরর হ্যান্ডলিং এবং লগিং
```

---

## প্রয়োজনীয় সেটআপ

### প্রয়োজনীয় সফটওয়্যার
- **Node.js**: v18 বা তার উপরে (https://nodejs.org/)
- **npm**: v8 বা তার উপরে (Node.js এর সাথে আসে)
- **Git**: অপশনাল (শুধু আপডেট সার্ভার সেটআপের জন্য)

### ইনস্টলেশন চেক করুন
```bash
node --version
npm --version
```

### প্রজেক্ট ডিপেন্ডেন্সিজ ইনস্টল করুন
```bash
# প্রজেক্ট ফোল্ডারে যান
cd h:\Web\scrap_data

# সব ডিপেন্ডেন্সি ইনস্টল করুন
npm install
```

---

## Build করার ধাপসমূহ

### ধাপ ১: প্রজেক্ট ফোল্ডার খুলুন

**Windows PowerShell এ:**
```powershell
cd h:\Web\scrap_data
```

### ধাপ ২: সব ডিপেন্ডেন্সি ইনস্টল করুন

```bash
npm install
```

**প্রথমবার করলে কয়েক মিনিট সময় লাগবে।**

### ধাপ ৩: NSIS ইনস্টলার এক্সিকিউটেবল তৈরি করুন

এটি একটি সম্পূর্ণ ইনস্টলার তৈরি করবে:

```bash
npm run build:gui-win
```

**এই কমান্ডটি:**
- `dist/` ফোল্ডারে তৈরি হবে
- দুটি ফাইল তৈরি করবে:
  - `Brox Scraper 1.0.0.exe` - NSIS ইনস্টলার
  - `Brox Scraper 1.0.0-portable.exe` - পোর্টেবল সংস্করণ

**সময়:** ৫-১৫ মিনিট (প্রথমবার বেশি সময় লাগতে পারে)

### ধাপ ৪: পোর্টেবল সংস্করণ তৈরি করুন (অপশনাল)

শুধুমাত্র পোর্টেবল এক্সিকিউটেবল তৈরি করতে:

```bash
npm run build:gui-win-portable
```

### ধাপ ৫: Standalone এক্সিকিউটেবল তৈরি করুন (অপশনাল)

একটি একক `.exe` ফাইল (কোন ইনস্টলেশন প্রয়োজন নেই):

```bash
npm run build:windows
```

**এই কমান্ডটি:**
- `dist/brox-scraper.exe` তৈরি করবে
- সরাসরি চালানো যাবে কোন ইনস্টলেশন ছাড়াই

---

## টেস্টিং গাইড

### ধাপ ১: তৈরি .exe ফাইল দিয়ে টেস্ট করুন

```bash
# dist ফোল্ডার খুলুন
cd dist

# ইনস্টলার চালান
.\Brox\ Scraper\ 1.0.0.exe
```

### ধাপ ২: ইনস্টলেশন প্রক্রিয়া

1. **Setup উইজার্ড খুলবে**
2. **ইনস্টলেশন ডিরেক্টরি নির্বাচন করুন** (ডিফল্ট: `C:\Users\<username>\AppData\Local\Programs\Brox Scraper`)
3. **নেক্সট ক্লিক করুন**
4. **ডেস্কটপ শর্টকাট তৈরি করুন** (চেক করুন)
5. **ইনস্টল করুন**

### ধাপ ৩: অ্যাপ চালান এবং পরীক্ষা করুন

```bash
# ডেস্কটপ শর্টকাট দিয়ে বা:
# Start Menu থেকে "Brox Scraper" খুঁজুন এবং চালান
```

### ধাপ ৪: আপডেট ফিচার পরীক্ষা করুন

অ্যাপ খোলার পর:

1. **মেনু খুলুন** → "ফাইল"
2. **"আপডেট চেক করুন" ক্লিক করুন**
3. আপডেট চেক বার্তা দেখবেন

**নোট:** প্রথমবার চেক করলে "কোন আপডেট নেই" দেখাবে কারণ আপডেট সার্ভার সেটআপ করতে হবে।

### ধাপ ৫: ফিচার যাচাই করুন

```
✓ অ্যাপ সঠিকভাবে চলছে
✓ ড্যাশবোর্ড লোড হচ্ছে
✓ স্ক্র্যাপার কাজ করছে
✓ আপডেট মেনু দেখা যাচ্ছে
✓ মেনু ভাষা বাংলায় রয়েছে
```

---

## আপডেট সার্ভার সেটআপ

### বিকল্প ১: GitHub Releases (সুপারিশকৃত)

#### পদক্ষেপ:

**১. GitHub রিপোজিটরি সেটআপ করুন:**
```bash
git init
git add .
git commit -m "Initial commit with auto-update feature"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

**২. `package.json` আপডেট করুন:**
```json
"publish": {
  "provider": "github",
  "owner": "YOUR_GITHUB_USERNAME",
  "repo": "YOUR_REPO_NAME"
}
```

**३. Build করুন এবং GitHub Releases এ আপলোড করুন:**
```bash
npm run build:gui-win
```

**४. আর্টিফ্যাক্ট GitHub Release এ যোগ করুন:**
- GitHub রিপোজিটরি খুলুন
- "Releases" এ যান
- নতুন Release তৈরি করুন
- `dist/` ফোল্ডার থেকে ফাইল আপলোড করুন:
  - `Brox Scraper 1.0.0.exe`
  - `Brox Scraper 1.0.0-portable.exe`
  - `latest.yml` (electron-builder দ্বারা তৈরি)

### বিকল্প ২: স্থানীয় আপডেট সার্ভার

আপডেট টেস্ট করার জন্য স্থানীয় সার্ভার সেটআপ করুন:

#### পদক্ষেপ:

**১. আপডেট মেটাডেটা তৈরি করুন:**

`latest.yml` ফাইল তৈরি করুন:
```yaml
version: 1.0.1
files:
  - url: http://localhost:8080/Brox%20Scraper%201.0.1.exe
    sha512: <SHA512_HASH_HERE>
    size: <FILE_SIZE_HERE>
path: http://localhost:8080/Brox%20Scraper%201.0.1.exe
sha512: <SHA512_HASH_HERE>
releaseDate: '2024-01-01T00:00:00.000Z'
```

**२. সার্ভার চালান:**

```bash
# Python সার্ভার (যদি আছে)
python -m http.server 8080

# অথবা Node.js দিয়ে
npx http-server . -p 8080
```

**३. অ্যাপে কাস্টম সার্ভার সেট করুন:**

`electron-main.js` তে:
```javascript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'http://localhost:8080/'
});
```

---

## সাধারণ সমস্যা এবং সমাধান

### সমস্যা ১: "node_modules not found"
**সমাধান:**
```bash
npm install
```

### সমস্যা २: Build ব্যর্থ হচ্ছে
**সমাধান:**
```bash
# নিম্নলিখিত চেষ্টা করুন:
rm -r node_modules dist
npm install
npm run build:gui-win
```

### সমস্যা ३: অ্যাপ চালু হচ্ছে না
**সমাধান:**
1. Windows Defender দিয়ে ব্লক হয়েছে কিনা চেক করুন
2. `.exe` রাইট-ক্লিক করে "Run as administrator" চেষ্টা করুন

### সমস্যা ४: আপডেট কাজ করছে না
**সমাধান:**
1. ইন্টারনেট সংযোগ চেক করুন
2. GitHub টোকেন সেট করা আছে কিনা যাচাই করুন:
```powershell
$env:GH_TOKEN="your_github_token"
```

---

## দ্রুত রেফারেন্স - সব কমান্ড

```bash
# ডেভেলপমেন্ট সার্ভার
npm run dev

# Electron ডেভেলপমেন্ট মোডে
npm run electron-dev

# পোর্টেবল .exe তৈরি করুন
npm run build:gui-win-portable

# সম্পূর্ণ ইনস্টলার তৈরি করুন (NSIS)
npm run build:gui-win

# Standalone এক্সিকিউটেবল তৈরি করুন
npm run build:windows

# স্টার্টআপ ইনস্টল করুন (Windows)
npm run startup:install

# স্টার্টআপ সরান (Windows)
npm run startup:remove
```

---

## ভার্সন আপডেট করার নিয়ম

নতুন ভার্সনের জন্য:

**1. `package.json` এ ভার্সন বাড়ান:**
```json
"version": "1.0.1"
```

**२. Build করুন এবং রিলিজ করুন:**
```bash
npm run build:gui-win
```

**३. GitHub Release এ নতুন রিলিজ তৈরি করুন**

---

## হেল্প এবং সাপোর্ট

কোন সমস্যা হলে:
1. কনসোল আউটপুট চেক করুন
2. `electron-main.js` এ লগ দেখুন
3. GitHub Issues তে রিপোর্ট করুন

---

**সর্বশেষ আপডেট:** ২০२६ সালের এপ্রিল  
**Brox Scraper Version:** ১.०.०
