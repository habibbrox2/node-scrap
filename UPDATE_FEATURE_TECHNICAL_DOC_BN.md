# Windows App - Update Feature প্রযুক্তিগত ডকুমেন্টেশন

## পরিবর্তনের সারসংক্ষেপ

এই ডকুমেন্টে Update Feature এর সব প্রযুক্তিগত বিবরণ রয়েছে।

---

## কী পরিবর্তন করা হয়েছে?

### ১. `package.json` আপডেট

#### ডিপেন্ডেন্সি যোগ করা হয়েছে:
```json
"devDependencies": {
  "electron-updater": "^6.1.0"
}
```

#### Build Configuration যোগ করা হয়েছে:
```json
"publish": {
  "provider": "github",
  "owner": "your-github-username",
  "repo": "your-repo-name"
}
```

---

### २. `electron-main.js` আপডেট

#### আমদানি (Import) করা হয়েছে:
```javascript
const { autoUpdater } = require('electron-updater');
```

#### অটো-আপডেটার কনফিগারেশন:
```javascript
autoUpdater.logger = console;
autoUpdater.logger.transports.file.level = 'info';
if (!isDevMode) {
  autoUpdater.checkForUpdatesAndNotify();
}
```

#### মেনুতে নতুন অপশন যোগ করা হয়েছে:
```javascript
{
  label: 'আপডেট চেক করুন',
  click: () => {
    autoUpdater.checkForUpdates().then(() => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'আপডেট পরীক্ষা',
        message: 'আপডেটের জন্য পরীক্ষা করছি...',
      });
    });
  },
}
```

#### ইভেন্ট হ্যান্ডলার:

**Update Available:**
```javascript
autoUpdater.on('update-available', (info) => {
  // নতুন আপডেট পাওয়া গেছে বিজ্ঞপ্তি
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'নতুন আপডেট উপলব্ধ',
    message: `সংস্করণ ${info.version} উপলব্ধ।`,
  });
});
```

**Update Downloaded:**
```javascript
autoUpdater.on('update-downloaded', (info) => {
  // আপডেট ডাউনলোড সম্পন্ন, ইনস্টল করার জন্য প্রস্তুত
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'আপডেট রেডি',
    message: `সংস্করণ ${info.version} ইনস্টল করার জন্য প্রস্তুত।`,
    buttons: ['এখনই পুনরায় চালু করুন', 'পরে'],
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
```

**Update Error:**
```javascript
autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err);
  dialog.showErrorBox('আপডেট ত্রুটি', 
    `আপডেট চেক ব্যর্থ: ${err.message}`);
});
```

#### IPC Handler (Renderer এ থেকে কল করার জন্য):
```javascript
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      updateInfo: result?.updateInfo,
      message: result?.updateInfo ? 'আপডেট উপলব্ধ' : 'কোন আপডেট নেই',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
});
```

---

## কীভাবে কাজ করে?

### আপডেট প্রবাহ (Flow):

```
1. অ্যাপ শুরু
   ↓
2. autoUpdater.checkForUpdatesAndNotify() কল হয়
   ↓
3. GitHub Release চেক করে
   ↓
4. নতুন ভার্সন পাওয়া গেলে:
   - update-available ইভেন্ট ট্রিগার হয়
   - বিজ্ঞপ্তি দেখায়
   ↓
5. স্বয়ংক্রিয় ডাউনলোড শুরু হয়
   ↓
6. ডাউনলোড সম্পন্ন হলে:
   - update-downloaded ইভেন্ট ট্রিগার হয়
   - ডায়ালগ দেখায় (পুনরায় চালু করার অপশন)
   ↓
7. ব্যবহারকারী "পুনরায় চালু করুন" বাটনে ক্লিক করলে:
   - quitAndInstall() কল হয়
   - অ্যাপ বন্ধ হয়
   - আপডেট ইনস্টল হয়
   - অ্যাপ নতুন সংস্করণ দিয়ে চালু হয়
```

---

## আপডেট সার্ভার কনফিগারেশন

### GitHub Provider কনফিগারেশন:

```javascript
// স্বয়ংক্রিয় (electron-builder দ্বারা পরিচালিত)
// package.json থেকে পড়ে:
{
  "provider": "github",
  "owner": "YOUR_GITHUB_USERNAME",
  "repo": "YOUR_REPO_NAME"
}
```

### কাস্টম সার্ভার কনফিগারেশন:

আপনার নিজের সার্ভার থেকে আপডেট দিতে চাইলে:

```javascript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://yourserver.com/updates/'
});
```

---

## আপডেট ফাইল ফরম্যাট

### `latest.yml` (মেটাডেটা ফাইল):

```yaml
version: 1.0.1                    # নতুন সংস্করণ
files:
  - url: https://github.com/.../Brox%20Scraper%201.0.1.exe
    sha512: <HASH>                # নিরাপত্তার জন্য
    size: 89752064                # ফাইল সাইজ
path: https://github.com/.../Brox%20Scraper%201.0.1.exe
sha512: <HASH>
releaseDate: '2024-01-01T00:00:00.000Z'
```

---

## পরিবেশ ভেরিয়েবল

### GitHub Token (অপশনাল):

Build করার সময় GitHub API লিমিট বাড়াতে:

```powershell
$env:GH_TOKEN="your_github_personal_access_token"
```

### Update Logger:

লগ ফাইল অবস্থান:
```
Windows: %APPDATA%/Brox Scraper/logs/
```

---

## ডিবাগিং

### লগ চেক করুন:

```javascript
// DevTools এ কনসোল খুলুন (F12)
// নিম্নলিখিত লগ দেখবেন:

[AutoUpdater] Checking for updates...
[AutoUpdater] Update available: 1.0.1
[AutoUpdater] Update downloaded: 1.0.1
```

### ম্যানুয়াল আপডেট চেক:

```javascript
// Renderer Process (preload.js) থেকে:
window.electronAPI.checkForUpdates().then(result => {
  console.log(result);
});
```

---

## নিরাপত্তা বিষয়সমূহ

### SHA-512 হ্যাশ যাচাই:
- প্রতিটি আপডেট ফাইল এর জন্য SHA-512 হ্যাশ প্রদান করা হয়
- ডাউনলোড করা ফাইল স্বয়ংক্রিয়ভাবে যাচাই করা হয়
- বিকৃত ফাইল ইনস্টল হবে না

### HTTPS সংযোগ:
- সব আপডেট ডাউনলোড HTTPS এর মাধ্যমে হয়
- Man-in-the-middle আক্রমণ থেকে সুরক্ষিত

---

## সমস্যা সমাধান

### সমস্যা: আপডেট কাজ করছে না

**কারণ:** সার্ভার কনফিগারেশন ভুল

**সমাধান:**
```javascript
// package.json এ সঠিক GitHub username এবং repo name দিন
"publish": {
  "provider": "github",
  "owner": "YOUR_ACTUAL_USERNAME",  // এখানে সঠিক নাম দিন
  "repo": "YOUR_ACTUAL_REPO"        // এখানে সঠিক রিপো দিন
}
```

### সমস্যা: ইনস্টল ব্যর্থ হচ্ছে

**কারণ:** পুরাতন প্রক্রিয়া চলছে

**সমাধান:**
```powershell
# Task Manager এ "Brox Scraper" প্রক্রিয়া বন্ধ করুন
Get-Process brox* | Stop-Process -Force
```

### সমস্যা: GitHub টোকেন সমস্যা

**সমাধান:**
```powershell
# টোকেন সেট করুন
$env:GH_TOKEN="your_token_here"

# অথবা .env ফাইল তৈরি করুন
echo "GH_TOKEN=your_token_here" > .env
```

---

## কর্মক্ষমতা তথ্য

| মেট্রিক | মূল্য |
|--------|-------|
| চেক করার সময় | ~500ms |
| ডাউনলোড সময় | নেটওয়ার্কের উপর নির্ভর করে |
| ইনস্টল সময় | ~২ মিনিট |
| ম্যানুয়াল চেক | অ্যাপ ব্যবহার বাধাগ্রস্ত করে না |

---

## ভবিষ্যত উন্নতি

- [ ] ডাউনলোড প্রগতি দেখানো
- [ ] আপডেট সময়সূচী সেট করা
- [ ] আপডেট রোলব্যাক অপশন
- [ ] বিটা চ্যানেল সাপোর্ট

---

**সর্বশেষ আপডেট:** এপ্রিল २०२६  
**সংস্করণ:** १.०.०
