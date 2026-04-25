const fs = require('fs');
const path = require('path');
const { getCacheDir, ensureDir } = require('./appPaths');

const CACHE_DIR = getCacheDir();
const CACHE_FILE = path.join(CACHE_DIR, 'articles.json');
const MOBILE_CACHE_FILE = path.join(CACHE_DIR, 'mobiles.json');
const META_FILE = path.join(CACHE_DIR, 'meta.json');

function ensureCacheDir() {
  ensureDir(CACHE_DIR);
}

function migrateMobilesFromArticlesCacheIfNeeded() {
  ensureCacheDir();

  // If mobiles cache already exists and has data, nothing to do.
  try {
    if (fs.existsSync(MOBILE_CACHE_FILE)) {
      const existingMobileText = fs.readFileSync(MOBILE_CACHE_FILE, 'utf-8');
      const existingMobile = JSON.parse(existingMobileText);
      if (Array.isArray(existingMobile) && existingMobile.length > 0) return;
    }
  } catch {
    // Continue with migration attempt.
  }

  if (!fs.existsSync(CACHE_FILE)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (!Array.isArray(raw) || raw.length === 0) return;

    const mobiles = raw.filter(item => item?.contentType === 'mobile');
    if (!mobiles.length) return;

    const articles = raw.filter(item => item?.contentType !== 'mobile');

    fs.writeFileSync(MOBILE_CACHE_FILE, JSON.stringify(mobiles.slice(0, 500), null, 2));
    fs.writeFileSync(CACHE_FILE, JSON.stringify(articles.slice(0, 500), null, 2));
  } catch {
    // Ignore migration failures.
  }
}

function readCache() {
  ensureCacheDir();
  if (!fs.existsSync(CACHE_FILE)) return [];
  migrateMobilesFromArticlesCacheIfNeeded();
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    // In case mobiles were previously stored in articles.json, exclude them from the articles cache view.
    return (Array.isArray(data) ? data : []).filter(item => item?.contentType !== 'mobile');
  } catch {
    return [];
  }
}

function readMobilesCache() {
  ensureCacheDir();
  migrateMobilesFromArticlesCacheIfNeeded();
  if (!fs.existsSync(MOBILE_CACHE_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(MOBILE_CACHE_FILE, 'utf-8'));
    return (Array.isArray(data) ? data : []).filter(item => item?.contentType === 'mobile');
  } catch {
    return [];
  }
}

function readMeta() {
  ensureCacheDir();
  if (!fs.existsSync(META_FILE)) return { lastRun: null, totalRuns: 0, totalArticles: 0, runs: [] };
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch {
    return { lastRun: null, totalRuns: 0, totalArticles: 0, runs: [] };
  }
}

function saveToCache(articles, options = {}) {
  ensureCacheDir();
  migrateMobilesFromArticlesCacheIfNeeded();

  const existing = readCache();

  const existingByUrl = new Map(existing.map(article => [article.url, article]));
  const newArticles = [];
  let updated = 0;

  function isBlankString(value) {
    return typeof value === 'string' && value.trim().length === 0;
  }

  function shouldFill(existingValue, incomingValue) {
    if (incomingValue === undefined || incomingValue === null) return false;

    if (Array.isArray(incomingValue)) {
      return (!Array.isArray(existingValue) || existingValue.length === 0) && incomingValue.length > 0;
    }

    if (typeof incomingValue === 'string') {
      return (existingValue === undefined || existingValue === null || isBlankString(existingValue)) && incomingValue.trim().length > 0;
    }

    if (typeof incomingValue === 'number' || typeof incomingValue === 'boolean') {
      return existingValue === undefined || existingValue === null;
    }

    if (typeof incomingValue === 'object') {
      return existingValue === undefined || existingValue === null;
    }

    return false;
  }

  function mergeFillMissing(existingArticle, incomingArticle) {
    let changed = false;
    const merged = { ...existingArticle };

    Object.entries(incomingArticle || {}).forEach(([key, value]) => {
      if (!shouldFill(merged[key], value)) return;
      merged[key] = value;
      changed = true;
    });

    if (!changed) return existingArticle;
    return merged;
  }

  // Add new articles and backfill missing fields for existing ones.
  for (const incoming of articles || []) {
    if (!incoming?.url) continue;

    const current = existingByUrl.get(incoming.url);
    if (!current) {
      existingByUrl.set(incoming.url, incoming);
      newArticles.push(incoming);
      continue;
    }

    const mergedArticle = mergeFillMissing(current, incoming);
    if (mergedArticle !== current) {
      existingByUrl.set(incoming.url, mergedArticle);
      updated += 1;
    }
  }

  const merged = [
    ...newArticles,
    ...existing.map(article => existingByUrl.get(article.url)).filter(Boolean),
  ];

  const maxItems = Number.parseInt(options.maxItems, 10);
  const limit = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 500;
  const trimmed = merged.slice(0, limit);

  fs.writeFileSync(CACHE_FILE, JSON.stringify(trimmed, null, 2));
  return { added: newArticles.length, updated, total: trimmed.length, newArticles };
}

function saveMobilesToCache(mobiles, options = {}) {
  ensureCacheDir();
  migrateMobilesFromArticlesCacheIfNeeded();

  const existing = readMobilesCache();
  const existingByUrl = new Map(existing.map(item => [item.url, item]));
  const newItems = [];
  let updated = 0;

  function isBlankString(value) {
    return typeof value === 'string' && value.trim().length === 0;
  }

  function shouldFill(existingValue, incomingValue) {
    if (incomingValue === undefined || incomingValue === null) return false;

    if (Array.isArray(incomingValue)) {
      return (!Array.isArray(existingValue) || existingValue.length === 0) && incomingValue.length > 0;
    }

    if (typeof incomingValue === 'string') {
      return (existingValue === undefined || existingValue === null || isBlankString(existingValue)) && incomingValue.trim().length > 0;
    }

    if (typeof incomingValue === 'number' || typeof incomingValue === 'boolean') {
      return existingValue === undefined || existingValue === null;
    }

    if (typeof incomingValue === 'object') {
      return existingValue === undefined || existingValue === null;
    }

    return false;
  }

  function mergeFillMissing(existingItem, incomingItem) {
    let changed = false;
    const merged = { ...existingItem };

    Object.entries(incomingItem || {}).forEach(([key, value]) => {
      if (!shouldFill(merged[key], value)) return;
      merged[key] = value;
      changed = true;
    });

    if (!changed) return existingItem;
    return merged;
  }

  for (const incoming of mobiles || []) {
    if (!incoming?.url) continue;
    if (incoming.contentType !== 'mobile') continue;

    const current = existingByUrl.get(incoming.url);
    if (!current) {
      existingByUrl.set(incoming.url, incoming);
      newItems.push(incoming);
      continue;
    }

    const mergedItem = mergeFillMissing(current, incoming);
    if (mergedItem !== current) {
      existingByUrl.set(incoming.url, mergedItem);
      updated += 1;
    }
  }

  const merged = [
    ...newItems,
    ...existing.map(item => existingByUrl.get(item.url)).filter(Boolean),
  ];

  const maxItems = Number.parseInt(options.maxItems, 10);
  const limit = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 500;
  const trimmed = merged.slice(0, limit);
  fs.writeFileSync(MOBILE_CACHE_FILE, JSON.stringify(trimmed, null, 2));
  return { added: newItems.length, updated, total: trimmed.length, newItems };
}

function applyCachePolicy(options = {}) {
  ensureCacheDir();
  migrateMobilesFromArticlesCacheIfNeeded();

  const maxAgeMs = Number.parseInt(options.maxAgeMs, 10) || 0;
  const maxArticles = Number.parseInt(options.maxArticles, 10) || 500;
  const maxMobiles = Number.parseInt(options.maxMobiles, 10) || 500;

  function withinRetention(item) {
    if (!maxAgeMs || maxAgeMs <= 0) return true;
    const ts = Date.parse(item?.scrapedAt || item?.publishedAt || '');
    if (Number.isNaN(ts)) return true;
    return ts >= Date.now() - maxAgeMs;
  }

  const beforeArticles = readCache();
  const beforeMobiles = readMobilesCache();

  const articles = beforeArticles.filter(withinRetention).slice(0, Math.max(1, maxArticles));
  const mobiles = beforeMobiles.filter(withinRetention).slice(0, Math.max(1, maxMobiles));

  fs.writeFileSync(CACHE_FILE, JSON.stringify(articles, null, 2));
  fs.writeFileSync(MOBILE_CACHE_FILE, JSON.stringify(mobiles, null, 2));

  return {
    before: { articles: beforeArticles.length, mobiles: beforeMobiles.length },
    after: { articles: articles.length, mobiles: mobiles.length },
    removed: {
      articles: Math.max(0, beforeArticles.length - articles.length),
      mobiles: Math.max(0, beforeMobiles.length - mobiles.length),
    },
  };
}

function updateMeta(runResult) {
  ensureCacheDir();
  const meta = readMeta();

  const pushResult = runResult.pushResult || {};
  const pushArticles = pushResult.articles || {};
  const pushMobiles = pushResult.mobiles || {};
  const legacyPushUrl = pushResult.url || null;
  const pushUrl = legacyPushUrl || pushArticles.url || pushMobiles.url || null;

  const runEntry = {
    runAt: new Date().toISOString(),
    scraped: runResult.total,
    success: runResult.success,
    errors: runResult.errors?.length || 0,
    addedToCache: runResult.addedToCache || 0,
    trigger: runResult.trigger || 'manual',
    pushed: pushResult.attempted || false,
    pushSuccess: pushResult.success || false,
    pushedCount: pushResult.count || 0,
    pushedArticles: Number(pushArticles.count || 0),
    pushedMobiles: Number(pushMobiles.count || 0),
    pushUrl,
  };

  meta.lastRun = runEntry.runAt;
  meta.totalRuns = (meta.totalRuns || 0) + 1;
  meta.totalArticles = runResult.cacheTotal || meta.totalArticles;
  meta.totalMobiles = runResult.mobileCacheTotal || meta.totalMobiles || 0;
  meta.runs = [runEntry, ...(meta.runs || [])].slice(0, 50); // Keep last 50 runs

  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  return meta;
}

function clearCache() {
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify([]));
  fs.writeFileSync(MOBILE_CACHE_FILE, JSON.stringify([]));
  return { cleared: true };
}

function getStats() {
  const articles = readCache();
  const mobiles = readMobilesCache();
  const meta = readMeta();
  const categories = {};
  articles.forEach(a => {
    if (a.category) categories[a.category] = (categories[a.category] || 0) + 1;
  });

  return {
    totalCached: articles.length,
    totalMobilesCached: mobiles.length,
    categories,
    lastRun: meta.lastRun,
    totalRuns: meta.totalRuns,
    recentRuns: meta.runs?.slice(0, 10) || [],
  };
}

module.exports = {
  readCache,
  readMobilesCache,
  saveToCache,
  saveMobilesToCache,
  applyCachePolicy,
  updateMeta,
  clearCache,
  getStats,
  readMeta,
};
