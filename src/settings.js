const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const SETTINGS_FILE = path.join(CACHE_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  pushEndpointUrl: 'https://broxlab.online/api/autocontent',
  pushEndpointHeaders: {},
  pushEnabled: true,

  // Scraping
  scrapeMaxItems: 10, // 0 = unlimited
  scrapeDelayMs: 300,

  // Cache policy
  cacheMaxArticles: 500,
  cacheMaxMobiles: 500,
  cacheAutoClearEnabled: false,
  cacheRetentionHours: 0, // 0 = disabled
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
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      pushEndpointHeaders:
        parsed && typeof parsed.pushEndpointHeaders === 'object' && parsed.pushEndpointHeaders
          ? parsed.pushEndpointHeaders
          : {},
    };

    merged.pushEnabled = merged.pushEnabled !== false;

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function updateSettings(partial = {}) {
  const current = readSettings();

  let next = {
    ...current,
    ...partial,
  };

  function clampInt(value, fallback, { min, max }) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return fallback;
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }

  // Push endpoint
  if (typeof next.pushEndpointUrl !== 'string') next.pushEndpointUrl = current.pushEndpointUrl;
  next.pushEndpointUrl = next.pushEndpointUrl.trim();
  if (!next.pushEndpointUrl) next.pushEndpointUrl = '';

  next.pushEnabled = next.pushEnabled !== false;

  if (!next.pushEndpointHeaders || typeof next.pushEndpointHeaders !== 'object') next.pushEndpointHeaders = {};

  // Scraping
  next.scrapeMaxItems = clampInt(next.scrapeMaxItems, current.scrapeMaxItems, { min: 0, max: 200 });
  next.scrapeDelayMs = clampInt(next.scrapeDelayMs, current.scrapeDelayMs, { min: 0, max: 5000 });

  // Cache policy
  next.cacheMaxArticles = clampInt(next.cacheMaxArticles, current.cacheMaxArticles, { min: 50, max: 5000 });
  next.cacheMaxMobiles = clampInt(next.cacheMaxMobiles, current.cacheMaxMobiles, { min: 50, max: 5000 });
  next.cacheAutoClearEnabled = Boolean(next.cacheAutoClearEnabled);
  next.cacheRetentionHours = clampInt(next.cacheRetentionHours, current.cacheRetentionHours, { min: 0, max: 24 * 365 });

  ensureCacheDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));

  // Always re-read to ensure returned payload matches persisted shape.
  next = readSettings();
  return next;
}

module.exports = {
  readSettings,
  updateSettings,
  DEFAULT_SETTINGS,
};
