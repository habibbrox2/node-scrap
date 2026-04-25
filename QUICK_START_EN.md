# GUI Windows App - English Quick Start

## 3 Steps to Build

### Step 1: Check System (Optional)
```bash
system-check.bat
```

### Step 2: Build the GUI App
```bash
build-gui.bat
```

Or manually:
```bash
npm install
npm run build:gui
```

### Step 3: Find & Run the Installer
```
dist/Brox Scraper Setup 1.0.0.exe
```

---

## What You Get

✅ **Desktop GUI Application**  
✅ **Windows Installer (.exe)**  
✅ **Full Web Dashboard**  
✅ **All Scraper Features**  
✅ **Background Server**  
✅ **Database & Caching**  
✅ **Auto-start Shortcuts**  

---

## Build Options

### Full Installer (Recommended)
```bash
npm run build:gui
```
- Complete installation experience
- Start menu shortcuts
- Uninstall support
- Output: `dist/Brox Scraper Setup 1.0.0.exe`

### Portable Version (No Installation)
```bash
npm run build:gui-win-portable
```
- No installation required
- Run from USB drive
- Output: `dist/Brox Scraper-1.0.0-portable.exe`

### Development Mode
```bash
npm install
npm run electron-start
```

---

## System Requirements

- **Windows**: 7+ (64-bit)
- **Internet**: For first run & scraping
- **Disk Space**: ~200MB
- **Node.js**: Required to build (not required to run)

---

## Files Created

| File | Purpose |
|------|---------|
| `electron-main.js` | Electron main process |
| `preload.js` | Security preload script |
| `package.json` | Updated with electron dependencies |
| `build-gui.bat` | One-click build script |
| `generate-icon.bat` | Icon generator |
| `system-check.bat` | System verification |

---

## Build Timeline

- First time: 5-10 minutes (downloads Electron)
- Subsequent builds: 2-3 minutes
- Internet speed matters most

---

## Architecture

```
Windows User
     ↓
Brox Scraper.exe (Electron)
     ├─ GUI Window
     └─ Node.js Server (Port 9999)
        ├─ Express Dashboard
        ├─ Scrapers
        ├─ Database
        └─ Cache
```

---

## Customization

### Change App Icon
1. Replace `assets/icon.png` (256x256 PNG)
2. Rebuild: `npm run build:gui`

### Change App Name
Edit `package.json`:
```json
{
  "productName": "Your App Name",
  ...
}
```

### Change Port
Edit `electron-main.js`:
```javascript
const SERVER_PORT = 9999;  // Change this
```

---

## Troubleshooting

**"Node.js not found"**
- Install Node.js: https://nodejs.org/
- Restart command prompt

**"Port 9999 already in use"**
- Change `SERVER_PORT` in `electron-main.js`

**"Build takes too long"**
- Normal for first build
- Electron needs to download (~200MB)

**"Icon not showing"**
- Ensure `assets/icon.png` exists and is 256x256
- Rebuild after adding icon

---

## Distribution

1. Build the app: `npm run build:gui`
2. Find `.exe` in `dist/` folder
3. Share the `.exe` file with users
4. Users just run it - done!

---

## Next Steps

1. ✅ Run `build-gui.bat`
2. ✅ Wait for build to complete
3. ✅ Find `.exe` in `dist/` folder
4. ✅ Test it
5. ✅ Share with friends/users

**Happy building! 🎉**
