const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const SETTINGS_FILE = path.join(CACHE_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  pushEndpointUrl: 'https://broxlab.online/api/autocontent',
  pushEndpointHeaders: {},
};

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readSettings() {
  ensureCacheDir();
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8') || '{}');
    return {
      ...DEFAULT_SETTINGS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      pushEndpointHeaders:
        parsed && typeof parsed.pushEndpointHeaders === 'object' && parsed.pushEndpointHeaders
          ? parsed.pushEndpointHeaders
          : {},
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function updateSettings(partial = {}) {
  const current = readSettings();

  const next = {
    ...current,
    ...partial,
  };

  if (typeof next.pushEndpointUrl !== 'string') next.pushEndpointUrl = current.pushEndpointUrl;
  next.pushEndpointUrl = next.pushEndpointUrl.trim();

  if (!next.pushEndpointUrl) {
    next.pushEndpointUrl = '';
  }

  if (!next.pushEndpointHeaders || typeof next.pushEndpointHeaders !== 'object') {
    next.pushEndpointHeaders = {};
  }

  ensureCacheDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  readSettings,
  updateSettings,
  DEFAULT_SETTINGS,
};

