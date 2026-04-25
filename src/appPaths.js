const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'Brox Scraper';

function getProjectRoot() {
  if (process.pkg) {
    const exeRoot = path.dirname(process.execPath);
    const externalPublicIndex = path.join(exeRoot, 'public', 'index.html');

    if (fs.existsSync(externalPublicIndex)) {
      return exeRoot;
    }
  }

  return path.resolve(__dirname, '..');
}

function getDataRoot() {
  const explicit = process.env.BROX_SCRAPER_DATA_DIR || process.env.SCRAPER_DATA_DIR;
  if (explicit) {
    return path.resolve(explicit);
  }

  if (process.env.BROX_SCRAPER_PORTABLE === '1') {
    return path.join(path.dirname(process.execPath), 'brox-scraper-data');
  }

  const base =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), 'AppData', 'Local');

  return path.join(base, APP_NAME);
}

function getCacheDir() {
  return path.join(getDataRoot(), 'cache');
}

function getPublicDir() {
  return path.join(getProjectRoot(), 'public');
}

function getStartupShortcutPath() {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', `${APP_NAME}.lnk`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

module.exports = {
  APP_NAME,
  getProjectRoot,
  getDataRoot,
  getCacheDir,
  getPublicDir,
  getStartupShortcutPath,
  ensureDir,
};
