# 🚀 আপডেট ফিচার - সম্পূর্ণ বাস্তবায়ন গাইড

## 📌 সারসংক্ষেপ

আপনার Windows Brox Scraper অ্যাপে নিম্নলিখিত আপডেট হয়েছে:

### ✅ যোগ করা ফিচার:
1. **Electron-Updater Integration** - স্বয়ংক্রিয় আপডেট সিস্টেম
2. **বাংলা ভাষায় আপডেট নোটিফিকেশন** - ব্যবহারকারী-বান্ধব বার্তা
3. **মেনু আইটেম** - "আপডেট চেক করুন" অপশন
4. **স্বয়ংক্রিয় ডাউনলোড এবং ইনস্টল** - ওয়ান-ক্লিক আপডেটিং
5. **এরর হ্যান্ডলিং** - সব ত্রুটি বাংলায় দেখানো হয়

---

## 📂 পরিবর্তিত ফাইল

| ফাইল | পরিবর্তন |
|------|----------|
| `package.json` | `electron-updater` ডিপেন্ডেন্সি যোগ + publish config |
| `electron-main.js` | আপডেটার লজিক, ইভেন্ট হ্যান্ডলার, মেনু অপশন |

---

## 📚 তৈরি করা ডকুমেন্টেশন

### ১. `QUICK_BUILD_STEPS_BN.md`
দ্রুত রেফারেন্স গাইড - ৫ মিনিটে Build এবং Test করার জন্য

### २. `BUILD_TEST_GUIDE_BN.md`
বিস্তারিত গাইড - সম্পূর্ণ সেটআপ, বিল্ড এবং টেস্টিং নির্দেশাবলী

### ३. `UPDATE_FEATURE_TECHNICAL_DOC_BN.md`
প্রযুক্তিগত ডকুমেন্টেশন - কোড পরিবর্তন এবং আর্কিটেকচার বিবরণ

---

## 🎯 এখনই শুরু করুন

### ধাপ ১: ডিপেন্ডেন্সি ইনস্টল করুন
```bash
cd h:\Web\scrap_data
npm install
```

### ধাপ २: Build করুন
```bash
npm run build:gui-win
```

### ধাপ ३: Test করুন
```bash
cd dist
.\Brox\ Scraper\ 1.0.0.exe
```

---

## 📋 Build কমান্ডের তুলনা

```bash
# NSIS ইনস্টলার (সুপারিশকৃত)
npm run build:gui-win
→ Output: dist/Brox Scraper 1.0.0.exe (ইনস্টলার)

# পোর্টেবল সংস্করণ
npm run build:gui-win-portable
→ Output: dist/Brox Scraper 1.0.0-portable.exe (কোন ইনস্টল প্রয়োজন নেই)

# স্ট্যান্ডঅ্যালোন EXE
npm run build:windows
→ Output: dist/brox-scraper.exe (একক ফাইল)
```

---

## 🔍 আপডেট সিস্টেম কীভাবে কাজ করে?

```
অ্যাপ শুরু হয়
    ↓
স্বয়ংক্রিয় আপডেট চেক
    ↓
GitHub Release এ নতুন সংস্করণ আছে কিনা চেক
    ↓
নতুন সংস্করণ পাওয়া গেলে:
├─ বিজ্ঞপ্তি দেখায়
├─ স্বয়ংক্রিয় ডাউনলোড শুরু করে
└─ ডাউনলোড সম্পন্ন হলে:
   ├─ দ্বিতীয় ডায়ালগ দেখায়
   └─ ব্যবহারকারী "পুনরায় চালু করুন" ক্লিক করলে:
      ├─ অ্যাপ বন্ধ হয়
      ├─ আপডেট ইনস্টল হয়
      └─ নতুন সংস্করণ দিয়ে অ্যাপ চালু হয়
```

---

## 🎨 নতুন মেনু আইটেম

ফাইল মেনুতে নতুন অপশন যুক্ত হয়েছে:

```
ফাইল
├── রিফ্রেশ (F5)
├── ড্যাশবোর্ড খুলুন (Ctrl+L)
├── ────────
├── আপডেট চেক করুন ← NEW!
├── ────────
└── প্রস্থান (Ctrl+Q)
```

---

## 🔧 GitHub Release সেটআপ (আপডেট কাজ করানোর জন্য)

### প্রথমবার সেটআপ:

**१. GitHub Repository তৈরি করুন এবং Push করুন:**
```bash
git init
git add .
git commit -m "Initial commit with auto-update feature"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/brox-scraper.git
git push -u origin main
```

**२. GitHub Release তৈরি করুন:**
- GitHub রিপোজিটরি খুলুন
- "Releases" এ যান
- "Draft a new release" ক্লিক করুন
- Tag version: `v1.0.0`
- Release title: `Brox Scraper 1.0.0`

**३. Build artifacts আপলোড করুন:**
```bash
npm run build:gui-win
cd dist
# এই ফাইলগুলি GitHub Release এ আপলোড করুন:
# - Brox Scraper 1.0.0.exe
# - Brox Scraper 1.0.0-portable.exe
# - latest.yml
```

**४. Release প্রকাশ করুন:**
- "Publish release" ক্লিক করুন

### আপডেট শেষ হওয়ার পর:

পরবর্তী ভার্সনের জন্য:
```bash
# package.json এ সংস্করণ বাড়ান
# নতুন সংস্করণ: 1.0.1

npm run build:gui-win
# dist ফোল্ডার থেকে ফাইলগুলি GitHub Release এ আপলোড করুন
```

---

## ⚙️ কাস্টমাইজেশন অপশন

### GitHub Provider ছাড়া অন্য কিছু ব্যবহার করতে চাইলে:

**`electron-main.js` এ পরিবর্তন করুন:**

```javascript
// GitHub Repository থেকে:
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'YOUR_USERNAME',
  repo: 'YOUR_REPO'
});

// অথবা কাস্টম সার্ভার থেকে:
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://yourserver.com/updates/'
});

// অথবা S3 থেকে:
autoUpdater.setFeedURL({
  provider: 's3',
  bucket: 'your-bucket',
  region: 'us-east-1'
});
```

---

## 📊 ফাইল সাইজ তথ্য

| ফাইল | আকার | বর্ণনা |
|------|-------|--------|
| `Brox Scraper 1.0.0.exe` | ~80-100 MB | ইনস্টলার (সম্পূর্ণ) |
| `Brox Scraper 1.0.0-portable.exe` | ~80-100 MB | পোর্টেবল (কোন ইনস্টল প্রয়োজন নেই) |
| `brox-scraper.exe` | ~80-100 MB | স্ট্যান্ডঅ্যালোন এক্সিকিউটেবল |

---

## 🐛 সাধারণ সমস্যা এবং সমাধান

### সমস্যা १: "npm: The term 'npm' is not recognized"
**সমাধান:** Node.js পুনরায় ইনস্টল করুন

### সমস্যা २: "dist/brox-scraper.exe কাজ করছে না"
**সমাধান:**
```bash
# নতুন করে Build করুন
rm -r dist
npm run build:windows
```

### সমস্যা ३: Build করা .exe ভাইরাস হিসেবে চিহ্নিত হচ্ছে
**সমাধান:** স্বাভাবিক - স্বাক্ষরিত নয়। GitHub Release এ রাখুন এবং এন্টারপ্রাইজ সার্টিফিকেট কিনুন

### সমস্যা ४: আপডেট চেক করছে না
**সমাধান:**
```bash
# ইন্টারনেট সংযোগ চেক করুন
# GitHub API টোকেন সেট করুন:
$env:GH_TOKEN="your_github_token"
```

---

## 📝 পরবর্তী পদক্ষেপ

### জন্য করতে হবে:

- [ ] `package.json` এ GitHub username এবং repo সঠিক করুন
- [ ] Build করুন এবং .exe টেস্ট করুন
- [ ] GitHub Repository সেটআপ করুন
- [ ] GitHub Release তৈরি করুন এবং artifacts আপলোড করুন
- [ ] পরবর্তী মেশিনে ইনস্টল করে টেস্ট করুন
- [ ] মেনু থেকে "আপডেট চেক করুন" টেস্ট করুন

---

## 📖 সম্পূর্ণ গাইড পড়ুন

বিস্তারিত নির্দেশাবলীর জন্য:
- 📄 [`BUILD_TEST_GUIDE_BN.md`](BUILD_TEST_GUIDE_BN.md) - সম্পূর্ণ গাইড
- 📄 [`QUICK_BUILD_STEPS_BN.md`](QUICK_BUILD_STEPS_BN.md) - দ্রুত রেফারেন্স
- 📄 [`UPDATE_FEATURE_TECHNICAL_DOC_BN.md`](UPDATE_FEATURE_TECHNICAL_DOC_BN.md) - প্রযুক্তিগত বিবরণ

---

## 💬 প্রশ্ন বা সমস্যা?

1. ডকুমেন্টেশন ফাইল আবার পড়ুন
2. লগ চেক করুন (Console এ F12)
3. নেটওয়ার্ক সংযোগ যাচাই করুন
4. GitHub Issues এ রিপোর্ট করুন

---

**প্রস্তুত? শুরু করুন:**
```bash
cd h:\Web\scrap_data
npm install
npm run build:gui-win
```

**Happy Building! 🎉**

---

**আপডেট:** এপ্রিল २०२६  
**Brox Scraper সংস্করণ:** १.०.०  
**Auto-Update System:** ✅ সক্রিয়
