const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { getPublicDir, getCacheDir, ensureDir } = require('./src/appPaths');
const {
  installStartupShortcut,
  removeStartupShortcut,
  getStartupShortcutState,
} = require('./src/windowsStartup');

const { curlPostJson } = require('./src/curl');
const {
  readCache,
  readMobilesCache,
  saveToCache,
  saveMobilesToCache,
  applyCachePolicy,
  updateMeta,
  clearCache,
  getStats,
} = require('./src/cache');
const { getScraper, listSources } = require('./src/scrapers');
const { readSettings, updateSettings } = require('./src/settings');
const { upsertContentItems, insertScrapeRun, DB_FILE } = require('./src/db');
const { toErrorDetails } = require('./src/errorDetails');

const app = express();
const PORT = process.env.PORT || 9999;
const DEFAULT_CRON_SCHEDULE = process.env.SCRAPER_CRON_SCHEDULE || '0 * * * *';
const CACHE_DIR = getCacheDir();
const CRON_LOG_FILE = path.join(CACHE_DIR, 'cron-jobs.log.jsonl');
const CRON_LOG_MAX_ITEMS = Number.parseInt(process.env.CRON_LOG_MAX_ITEMS || '500', 10);
const PUSH_LOG_FILE = path.join(CACHE_DIR, 'push.log.jsonl');
const PUSH_LOG_MAX_ITEMS = Number.parseInt(process.env.PUSH_LOG_MAX_ITEMS || '1000', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(getPublicDir()));

function serveDashboard(req, res) {
  res.sendFile(path.join(getPublicDir(), 'index.html'));
}

app.get('/', serveDashboard);
app.get('/index.html', serveDashboard);

const argSet = new Set(process.argv.slice(2).map(value => String(value).toLowerCase()));
if (argSet.has('--install-startup') || process.env.BROX_INSTALL_STARTUP === '1') {
  try {
    const result = installStartupShortcut(process.execPath);
    console.log(`[Startup] Installed shortcut at ${result.shortcutPath}`);
  } catch (err) {
    console.error('[Startup] Install failed:', err.message);
  }
}

if (argSet.has('--remove-startup')) {
  try {
    const result = removeStartupShortcut();
    console.log(result.removed ? `[Startup] Removed ${result.shortcutPath}` : '[Startup] No shortcut found');
  } catch (err) {
    console.error('[Startup] Remove failed:', err.message);
  }
}

let scrapeStatus = {
  running: false,
  trigger: null,
  startedAt: null,
  log: [],
  lastResult: null,
};

function ensureCronLogDir() {
  ensureDir(path.dirname(CRON_LOG_FILE));
}

function ensurePushLogDir() {
  ensureDir(path.dirname(PUSH_LOG_FILE));
}

function readCronLogsFromDisk() {
  try {
    if (!fs.existsSync(CRON_LOG_FILE)) return [];
    const lines = fs.readFileSync(CRON_LOG_FILE, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const parsed = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return parsed.slice(-Math.max(10, CRON_LOG_MAX_ITEMS));
  } catch {
    return [];
  }
}

let cronRunLogs = readCronLogsFromDisk();

function logCronEvent(event = {}) {
  const entry = {
    time: new Date().toISOString(),
    ...event,
  };

  cronRunLogs.push(entry);
  if (cronRunLogs.length > Math.max(10, CRON_LOG_MAX_ITEMS)) {
    cronRunLogs = cronRunLogs.slice(-Math.max(10, CRON_LOG_MAX_ITEMS));
  }

  try {
    ensureCronLogDir();
    fs.appendFileSync(CRON_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Ignore log persistence errors.
  }

  return entry;
}

function readPushLogsFromDisk() {
  try {
    if (!fs.existsSync(PUSH_LOG_FILE)) return [];
    const lines = fs.readFileSync(PUSH_LOG_FILE, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const parsed = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return parsed.slice(-Math.max(20, PUSH_LOG_MAX_ITEMS));
  } catch {
    return [];
  }
}

let pushRunLogs = readPushLogsFromDisk();

function logPushEvent(event = {}) {
  const entry = {
    time: new Date().toISOString(),
    ...event,
  };

  pushRunLogs.push(entry);
  if (pushRunLogs.length > Math.max(20, PUSH_LOG_MAX_ITEMS)) {
    pushRunLogs = pushRunLogs.slice(-Math.max(20, PUSH_LOG_MAX_ITEMS));
  }

  try {
    ensurePushLogDir();
    fs.appendFileSync(PUSH_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Ignore push log persistence errors.
  }

  return entry;
}

function parseJsonEnv(value, fallback = {}) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getPushConfig(kind = 'articles', overrides = {}) {
  const settings = readSettings();

  const normalizedKind = kind === 'mobiles' ? 'mobiles' : 'articles';
  const urlOverride = normalizedKind === 'mobiles' ? overrides.pushMobilesUrl : overrides.pushArticlesUrl;
  const enabledOverride = normalizedKind === 'mobiles' ? overrides.pushMobilesEnabled : overrides.pushArticlesEnabled;

  const defaultUrl = normalizedKind === 'mobiles'
    ? settings.pushMobilesEndpointUrl
    : settings.pushArticlesEndpointUrl;
  const fallbackLegacyUrl = settings.pushEndpointUrl || process.env.PUSH_ENDPOINT_URL || '';
  const endpointUrl = urlOverride || overrides.pushUrl || defaultUrl || fallbackLegacyUrl;

  const globalEnabled = overrides.pushEnabled !== undefined
    ? Boolean(overrides.pushEnabled)
    : settings.pushEnabled !== false;
  const kindEnabledSetting = normalizedKind === 'mobiles'
    ? settings.pushMobilesEnabled !== false
    : settings.pushArticlesEnabled !== false;
  const kindEnabled = enabledOverride !== undefined
    ? Boolean(enabledOverride)
    : kindEnabledSetting;

  const bearerToken = (process.env.SCRAPER_PUSH_BEARER_TOKEN || '').toString().trim();
  const autoAuthHeader = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};
  const headers = {
    ...autoAuthHeader,
    ...parseJsonEnv(process.env.PUSH_ENDPOINT_HEADERS_JSON, {}),
    ...(settings.pushEndpointHeaders || {}),
    ...(overrides.pushHeaders || {}),
  };

  return {
    kind: normalizedKind,
    url: endpointUrl,
    headers,
    enabled: globalEnabled && kindEnabled && Boolean(endpointUrl),
  };
}

async function pushItemsToEndpoint(items, options = {}) {
  const pushConfig = getPushConfig(options.kind || 'articles', options);
  const payloadKey = pushConfig.kind === 'mobiles' ? 'mobiles' : 'articles';
  const pushContext = {
    event: 'push-result',
    kind: pushConfig.kind,
    trigger: options.trigger || 'manual',
    sourceKey: options.sourceKey || null,
    url: pushConfig.url || null,
    itemCount: Array.isArray(items) ? items.length : 0,
  };

  if (!pushConfig.enabled) {
    const result = {
      kind: pushConfig.kind,
      attempted: false,
      success: false,
      count: 0,
      url: null,
      message: 'Push endpoint not configured',
    };
    logPushEvent({
      ...pushContext,
      attempted: result.attempted,
      success: result.success,
      count: result.count,
      status: 'disabled',
      message: result.message,
    });
    return result;
  }

  if (!items.length) {
    const result = {
      kind: pushConfig.kind,
      attempted: true,
      success: true,
      count: 0,
      url: pushConfig.url,
      message: `No new ${payloadKey} to push`,
    };
    logPushEvent({
      ...pushContext,
      attempted: result.attempted,
      success: result.success,
      count: result.count,
      status: 'skipped-empty',
      message: result.message,
    });
    return result;
  }

  const payload = {
    contentType: pushConfig.kind === 'mobiles' ? 'mobile' : 'article',
    source: options.sourceKey || 'brox',
    trigger: options.trigger || 'manual',
    pushedAt: new Date().toISOString(),
  };

  const configuredBatchSize = Number.parseInt(
    String(options.batchSize ?? process.env.PUSH_BATCH_SIZE ?? '25'),
    10
  );
  const batchSize = Number.isFinite(configuredBatchSize) && configuredBatchSize > 0
    ? configuredBatchSize
    : items.length;
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  let pushedCount = 0;

  try {
    for (let index = 0; index < batches.length; index += 1) {
      const batchItems = batches[index];
      // Keep a unified `items` array for easier consumption on the receiver side,
      // while also preserving legacy keys (`articles` / `mobiles`) for compatibility.
      const body = {
        ...payload,
        count: batchItems.length,
        items: batchItems,
        [payloadKey]: batchItems,
      };
      const response = await curlPostJson(pushConfig.url, {
        ...body,
      }, {
        headers: pushConfig.headers,
        timeout: parseInt(process.env.PUSH_ENDPOINT_TIMEOUT_MS || '30000', 10),
      });
      const httpStatus = Number.parseInt(response?.statusCode, 10) || 0;
      const responseText = typeof response?.body === 'string' ? response.body : '';

      const responseSnippet = responseText.trim().slice(0, 1000);
      let parsedResponse = null;
      try {
        parsedResponse = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsedResponse = null;
      }

      const endpointRejected = Boolean(
        (httpStatus && (httpStatus < 200 || httpStatus >= 300)) ||
        parsedResponse &&
        typeof parsedResponse === 'object' &&
        (parsedResponse.success === false || parsedResponse.ok === false)
      );
      if (endpointRejected) {
        const errorMessage =
          (httpStatus && (httpStatus < 200 || httpStatus >= 300) && `Push endpoint returned HTTP ${httpStatus}`) ||
          (typeof parsedResponse.error === 'string' && parsedResponse.error.trim()) ||
          (typeof parsedResponse.message === 'string' && parsedResponse.message.trim()) ||
          'Push endpoint returned failure';
        const result = {
          kind: pushConfig.kind,
          attempted: true,
          success: false,
          count: pushedCount,
          url: pushConfig.url,
          error: errorMessage,
          responseText: responseSnippet,
        };
        logPushEvent({
          ...pushContext,
          attempted: result.attempted,
          success: result.success,
          count: result.count,
          status: 'failed-response',
          httpStatus,
          batch: {
            index: index + 1,
            total: batches.length,
            size: batchItems.length,
          },
          error: result.error,
          responseText: result.responseText,
        });
        return result;
      }

      pushedCount += batchItems.length;
    }

    const result = {
      kind: pushConfig.kind,
      attempted: true,
      success: true,
      count: pushedCount,
      url: pushConfig.url,
      message: batches.length > 1
        ? `Pushed in ${batches.length} batches`
        : undefined,
    };
    logPushEvent({
      ...pushContext,
      attempted: result.attempted,
      success: result.success,
      count: result.count,
      status: 'success',
      batch: {
        total: batches.length,
        size: batchSize,
      },
      message: result.message,
    });
    return result;
  } catch (err) {
    const result = {
      kind: pushConfig.kind,
      attempted: true,
      success: false,
      count: items.length,
      url: pushConfig.url,
      error: err.message,
    };
    logPushEvent({
      ...pushContext,
      attempted: result.attempted,
      success: result.success,
      count: result.count,
      status: 'failed',
      error: result.error,
    });
    return result;
  }
}

async function executeScrape(trigger = 'manual', options = {}) {
  if (scrapeStatus.running) {
    return { error: 'Scraper is already running', status: scrapeStatus };
  }

  const settings = readSettings();
  const maxItemsOverride = options.maxItems !== undefined ? Number.parseInt(options.maxItems, 10) : undefined;
  const delayOverride = options.delayMs !== undefined ? Number.parseInt(options.delayMs, 10) : undefined;

  const scrapeMaxItems = Number.isFinite(maxItemsOverride) && maxItemsOverride >= 0
    ? maxItemsOverride
    : Number.parseInt(settings.scrapeMaxItems, 10) || 0;

  const scrapeDelayMs = Number.isFinite(delayOverride) && delayOverride >= 0
    ? delayOverride
    : Number.parseInt(settings.scrapeDelayMs, 10) || 0;

  process.env.SCRAPER_REQUEST_MIN_INTERVAL_MS = String(
    Number.parseInt(settings.scrapeRequestMinIntervalMs, 10) || 0
  );

  const sourceKey = (options.source || process.env.SCRAPER_SOURCE || 'prothomalo')
    .toString()
    .trim()
    .toLowerCase();

  const runAllSources = sourceKey === 'all' || sourceKey === '*';
  const sourcesToRun = runAllSources ? listSources() : [sourceKey];
  const pushAllCached = options.pushAllCached !== undefined
    ? Boolean(options.pushAllCached)
    : String(process.env.PUSH_ALL_CACHED || '1').toLowerCase() !== 'false';

  scrapeStatus = {
    running: true,
    trigger,
    startedAt: new Date().toISOString(),
    log: [],
    lastResult: null,
  };

  console.log(
    `[Scraper] Starting (source: ${runAllSources ? 'all' : sourceKey}, trigger: ${trigger})`
  );

  try {
    const perSource = {};
    const combinedErrors = [];
    const pushArticleItems = [];
    const pushMobileItems = [];

    let combinedTotal = 0;
    let combinedSuccess = 0;
    let combinedFailed = 0;

    let combinedAddedToCache = 0;
    let combinedUpdatedInCache = 0;
    let combinedAddedMobilesToCache = 0;
    let combinedUpdatedMobilesInCache = 0;

    for (const runKey of sourcesToRun) {
      const scraper = getScraper(runKey);

      scrapeStatus.log.push({
        time: new Date().toISOString(),
        stage: 'source',
        message: `Starting source: ${runKey}`,
        sourceKey: runKey,
      });

      try {
        const result = await scraper.runScraper(progress => {
          const entry = {
            ...progress,
            time: new Date().toISOString(),
            sourceKey: runKey,
            stage: progress.stage,
            message: `[${runKey}] ${progress.message}`,
          };
          scrapeStatus.log.push(entry);
          console.log(`[Scraper] ${runKey}:${progress.stage}: ${progress.message}`);
        }, { maxItems: scrapeMaxItems, delayMs: scrapeDelayMs });

        perSource[runKey] = result;
        combinedTotal += Number(result.total || 0);
        combinedSuccess += Number(result.success || 0);
        combinedFailed += Number(result.failed || 0);
        if (Array.isArray(result.errors) && result.errors.length) {
          combinedErrors.push(...result.errors.map(err => ({ ...err, sourceKey: runKey })));
        }

        const allItems = (result.articles || []).map(item => ({
          ...item,
          sourceKey: item?.sourceKey || runKey,
          source: item?.source || runKey,
        }));
        const mobiles = allItems.filter(item => item?.contentType === 'mobile');
        const articles = allItems.filter(item => item?.contentType !== 'mobile');

        const cacheResult = saveToCache(articles, { maxItems: settings.cacheMaxArticles });
        const mobileCacheResult = saveMobilesToCache(mobiles, { maxItems: settings.cacheMaxMobiles });

        combinedAddedToCache += Number(cacheResult.added || 0);
        combinedUpdatedInCache += Number(cacheResult.updated || 0);
        combinedAddedMobilesToCache += Number(mobileCacheResult.added || 0);
        combinedUpdatedMobilesInCache += Number(mobileCacheResult.updated || 0);

        pushArticleItems.push(...(cacheResult.newArticles || []));
        pushMobileItems.push(...(mobileCacheResult.newItems || []));
      } catch (err) {
        const errorEntry = {
          error: err.message,
          errorDetails: toErrorDetails(err),
          sourceKey: runKey,
        };
        perSource[runKey] = errorEntry;
        combinedErrors.push(errorEntry);

        scrapeStatus.log.push({
          time: new Date().toISOString(),
          stage: 'error',
          message: `Source failed: ${runKey} (${err.message})`,
          sourceKey: runKey,
          errorDetails: toErrorDetails(err),
        });
      }
    }

    const articlesForPush = pushAllCached ? readCache() : pushArticleItems;
    const mobilesForPush = pushAllCached ? readMobilesCache() : pushMobileItems;

    const pushArticlesResult = await pushItemsToEndpoint(articlesForPush, {
      kind: 'articles',
      trigger,
      pushUrl: options.pushUrl,
      pushArticlesUrl: options.pushArticlesUrl,
      pushHeaders: options.pushHeaders,
      pushEnabled: options.pushEnabled,
      pushArticlesEnabled: options.pushArticlesEnabled,
      sourceKey: runAllSources ? 'all' : sourceKey,
    });

    const pushMobilesResult = await pushItemsToEndpoint(mobilesForPush, {
      kind: 'mobiles',
      trigger,
      pushUrl: options.pushUrl,
      pushMobilesUrl: options.pushMobilesUrl,
      pushHeaders: options.pushHeaders,
      pushEnabled: options.pushEnabled,
      pushMobilesEnabled: options.pushMobilesEnabled,
      sourceKey: runAllSources ? 'all' : sourceKey,
    });

    const pushResult = {
      attempted: Boolean(pushArticlesResult.attempted || pushMobilesResult.attempted),
      success:
        (!pushArticlesResult.attempted || pushArticlesResult.success) &&
        (!pushMobilesResult.attempted || pushMobilesResult.success),
      count: Number(pushArticlesResult.count || 0) + Number(pushMobilesResult.count || 0),
      articles: pushArticlesResult,
      mobiles: pushMobilesResult,
    };

    const stats = getStats();

    if (settings.cacheAutoClearEnabled && Number.parseInt(settings.cacheRetentionHours, 10) > 0) {
      applyCachePolicy({
        maxAgeMs: Number.parseInt(settings.cacheRetentionHours, 10) * 60 * 60 * 1000,
        maxArticles: settings.cacheMaxArticles,
        maxMobiles: settings.cacheMaxMobiles,
      });
    }

    const finalResult = {
      total: combinedTotal,
      success: combinedSuccess,
      failed: combinedFailed,
      errors: combinedErrors,
      perSource,
      addedToCache: combinedAddedToCache,
      updatedInCache: combinedUpdatedInCache,
      cacheTotal: stats.totalCached,
      addedMobilesToCache: combinedAddedMobilesToCache,
      updatedMobilesInCache: combinedUpdatedMobilesInCache,
      mobileCacheTotal: stats.totalMobilesCached,
      pushedArticles: Number(pushArticlesResult.count || 0),
      pushedMobiles: Number(pushMobilesResult.count || 0),
      pushAllCached,
      pushResult,
      trigger,
      sourceKey: runAllSources ? 'all' : sourceKey,
      sourcesRun: sourcesToRun,
    };

    // Store to DB (best-effort; doesn't block the scrape result if it fails).
    try {
      const toStore = [];
      Object.entries(perSource).forEach(([k, r]) => {
        if (r && Array.isArray(r.articles) && r.articles.length) {
          toStore.push(...r.articles.map(item => ({ ...item, sourceKey: k })));
        }
      });

      upsertContentItems(toStore, { sourceKey: finalResult.sourceKey, trigger });
      insertScrapeRun(finalResult);
    } catch (dbErr) {
      scrapeStatus.log.push({
        time: new Date().toISOString(),
        stage: 'db',
        message: `DB store failed: ${dbErr.message}`,
        errorDetails: toErrorDetails(dbErr),
      });
    }

    updateMeta(finalResult);
    scrapeStatus.lastResult = finalResult;
    scrapeStatus.running = false;

    console.log(
      `[Scraper] Done - ${finalResult.success}/${finalResult.total} items, +${finalResult.addedToCache} articles, +${finalResult.addedMobilesToCache} mobiles, push attempted: ${pushResult.attempted}, pushed: ${pushResult.count}`
    );

    return finalResult;
  } catch (err) {
    console.error('[Scraper] Error:', err.message);
    scrapeStatus.running = false;
    const errorDetails = toErrorDetails(err);
    scrapeStatus.log.push({
      time: new Date().toISOString(),
      stage: 'error',
      message: `Scrape failed: ${err.message}`,
      errorDetails,
    });
    scrapeStatus.lastResult = { error: err.message, errorDetails };
    throw err;
  }
}

const cronJobs = {};

function startCronJob(schedule, name, options = {}) {
  if (cronJobs[name]) {
    cronJobs[name].task.stop();
    logCronEvent({ event: 'cron-replaced', job: name, schedule, trigger: 'system' });
  }

  const task = cron.schedule(schedule, async () => {
    const triggeredAt = new Date().toISOString();
    console.log(`[Cron:${name}] Triggered at ${triggeredAt}`);
    logCronEvent({ event: 'cron-triggered', job: name, schedule, trigger: 'cron' });
    try {
      const result = await executeScrape(`cron:${name}`, options);
      logCronEvent({
        event: 'cron-success',
        job: name,
        schedule,
        trigger: 'cron',
        total: result.total || 0,
        success: result.success || 0,
        failed: result.failed || 0,
        pushedArticles: result.pushedArticles || 0,
        pushedMobiles: result.pushedMobiles || 0,
      });
    } catch (err) {
      console.error(`[Cron:${name}] Failed:`, err.message);
      logCronEvent({
        event: 'cron-failed',
        job: name,
        schedule,
        trigger: 'cron',
        error: err.message,
      });
    }
  });

  cronJobs[name] = {
    task,
    schedule,
    options,
    startedAt: new Date().toISOString(),
  };

  console.log(`[Cron] Job "${name}" started with schedule: ${schedule}`);
  logCronEvent({ event: 'cron-started', job: name, schedule, trigger: 'system' });
}

function stopCronJob(name) {
  if (!cronJobs[name]) {
    return false;
  }

  cronJobs[name].task.stop();
  delete cronJobs[name];
  logCronEvent({ event: 'cron-stopped', job: name, trigger: 'system' });
  return true;
}

startCronJob(DEFAULT_CRON_SCHEDULE, 'hourly');

// Apply cache retention policy periodically (if enabled in settings).
setInterval(() => {
  try {
    const settings = readSettings();
    if (!settings.cacheAutoClearEnabled) return;
    const hours = Number.parseInt(settings.cacheRetentionHours, 10) || 0;
    if (!hours) return;
    applyCachePolicy({
      maxAgeMs: hours * 60 * 60 * 1000,
      maxArticles: settings.cacheMaxArticles,
      maxMobiles: settings.cacheMaxMobiles,
    });
  } catch {
    // Ignore background policy errors.
  }
}, 10 * 60 * 1000);

try {
  const settings = readSettings();
  if (settings.cacheAutoClearEnabled && (Number.parseInt(settings.cacheRetentionHours, 10) || 0) > 0) {
    applyCachePolicy({
      maxAgeMs: (Number.parseInt(settings.cacheRetentionHours, 10) || 0) * 60 * 60 * 1000,
      maxArticles: settings.cacheMaxArticles,
      maxMobiles: settings.cacheMaxMobiles,
    });
  }
} catch { }

function clampPageLimit(value, fallback = 20) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function listCronJobs() {
  return Object.entries(cronJobs).map(([name, job]) => ({
    name,
    schedule: job.schedule,
    startedAt: job.startedAt || null,
  }));
}

function itemMatchesSource(item, sourceQuery) {
  if (!sourceQuery) return true;
  const needle = String(sourceQuery).trim().toLowerCase();
  if (!needle) return true;
  const sourceFields = [
    item?.sourceKey,
    item?.source,
    item?.scraperSource,
  ]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase());

  return sourceFields.some(value => value === needle || value.includes(needle));
}

app.get('/api/status', (req, res) => {
  const stats = getStats();
  const settings = readSettings();
  const activeCrons = listCronJobs();
  res.json({
    scraper: scrapeStatus,
    cache: stats,
    activeCrons,
    push: {
      articles: getPushConfig('articles'),
      mobiles: getPushConfig('mobiles'),
    },
    settings,
    database: { type: 'sqlite', file: DB_FILE },
    sources: listSources(),
    defaultSource: (process.env.SCRAPER_SOURCE || 'prothomalo').toString(),
    recentCronLogs: cronRunLogs.slice(-20).reverse(),
    recentPushLogs: pushRunLogs.slice(-30).reverse(),
  });
});

app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
  const {
    pushEndpointUrl,
    pushArticlesEndpointUrl,
    pushMobilesEndpointUrl,
    pushEndpointHeaders,
    pushEndpointHeadersJson,
  } = req.body || {};
  const {
    pushEnabled,
    pushArticlesEnabled,
    pushMobilesEnabled,
    scrapeMaxItems,
    scrapeDelayMs,
    scrapeRequestMinIntervalMs,
    cacheMaxArticles,
    cacheMaxMobiles,
    cacheAutoClearEnabled,
    cacheRetentionHours,
  } = req.body || {};

  let headers = pushEndpointHeaders;
  if (!headers && typeof pushEndpointHeadersJson === 'string') {
    headers = parseJsonEnv(pushEndpointHeadersJson, {});
  }
  if (!headers || typeof headers !== 'object') headers = {};

  const updated = updateSettings({
    ...(pushEndpointUrl !== undefined ? { pushEndpointUrl } : {}),
    ...(pushArticlesEndpointUrl !== undefined ? { pushArticlesEndpointUrl } : {}),
    ...(pushMobilesEndpointUrl !== undefined ? { pushMobilesEndpointUrl } : {}),
    ...(headers !== undefined ? { pushEndpointHeaders: headers } : {}),
    ...(pushEnabled !== undefined ? { pushEnabled } : {}),
    ...(pushArticlesEnabled !== undefined ? { pushArticlesEnabled } : {}),
    ...(pushMobilesEnabled !== undefined ? { pushMobilesEnabled } : {}),
    ...(scrapeMaxItems !== undefined ? { scrapeMaxItems } : {}),
    ...(scrapeDelayMs !== undefined ? { scrapeDelayMs } : {}),
    ...(scrapeRequestMinIntervalMs !== undefined ? { scrapeRequestMinIntervalMs } : {}),
    ...(cacheMaxArticles !== undefined ? { cacheMaxArticles } : {}),
    ...(cacheMaxMobiles !== undefined ? { cacheMaxMobiles } : {}),
    ...(cacheAutoClearEnabled !== undefined ? { cacheAutoClearEnabled } : {}),
    ...(cacheRetentionHours !== undefined ? { cacheRetentionHours } : {}),
  });

  res.json(updated);
});

app.post('/api/scrape', async (req, res) => {
  if (scrapeStatus.running) {
    return res.status(409).json({ error: 'Scraper already running', status: scrapeStatus });
  }

  const {
    pushUrl,
    pushArticlesUrl,
    pushMobilesUrl,
    pushHeaders,
    pushEnabled,
    pushArticlesEnabled,
    pushMobilesEnabled,
    pushAllCached,
    source,
    maxItems,
    delayMs,
  } = req.body || {};
  const pushArticlesConfig = getPushConfig('articles', {
    pushUrl,
    pushArticlesUrl,
    pushHeaders,
    pushEnabled,
    pushArticlesEnabled,
  });
  const pushMobilesConfig = getPushConfig('mobiles', {
    pushUrl,
    pushMobilesUrl,
    pushHeaders,
    pushEnabled,
    pushMobilesEnabled,
  });

  res.json({
    message: 'Scrape started',
    trigger: 'manual',
    startedAt: new Date().toISOString(),
    pushEnabled: pushArticlesConfig.enabled || pushMobilesConfig.enabled,
    push: {
      articles: { enabled: pushArticlesConfig.enabled, url: pushArticlesConfig.url || null },
      mobiles: { enabled: pushMobilesConfig.enabled, url: pushMobilesConfig.url || null },
    },
    pushMode: pushAllCached === false ? 'new-only' : 'all-cached',
    source: source || process.env.SCRAPER_SOURCE || 'prothomalo',
    maxItems: maxItems ?? null,
  });

  executeScrape('manual', {
    pushUrl,
    pushArticlesUrl,
    pushMobilesUrl,
    pushHeaders,
    pushEnabled,
    pushArticlesEnabled,
    pushMobilesEnabled,
    pushAllCached,
    source,
    maxItems,
    delayMs,
  }).catch(err => {
    console.error('Manual scrape error:', err.message);
  });
});

app.get('/api/articles', (req, res) => {
  const { page = 1, limit = 20, category, search, from, to, source, sort = 'desc' } = req.query;
  let articles = readCache();

  const BN_DIGITS = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };
  const BN_MONTHS = {
    'জানুয়ারি': '01',
    'ফেব্রুয়ারি': '02',
    'মার্চ': '03',
    'এপ্রিল': '04',
    'মে': '05',
    'জুন': '06',
    'জুলাই': '07',
    'আগস্ট': '08',
    'সেপ্টেম্বর': '09',
    'অক্টোবর': '10',
    'নভেম্বর': '11',
    'ডিসেম্বর': '12',
  };

  function normalizeBanglaDigits(value) {
    return String(value || '').replace(/[০-৯]/g, ch => BN_DIGITS[ch] || ch);
  }

  function parseBanglaPublishedText(value) {
    const raw = normalizeBanglaDigits(value)
      .replace(/\s+/g, ' ')
      .replace(/[：]/g, ':')
      .trim();
    if (!raw) return 0;

    // Examples:
    // "প্রকাশ: 24 এপ্রিল 2026, 17:42"
    // "আপডেট: 24 এপ্রিল 2026, 17:08"
    const m = raw.match(/(?:প্রকাশ|আপডেট|Published|Updated)\s*:\s*(\d{1,2})\s+([^\s,]+)\s+(\d{4}),\s*(\d{1,2})\s*:\s*(\d{2})/i);
    if (!m) return 0;

    const day = String(parseInt(m[1], 10)).padStart(2, '0');
    const month = BN_MONTHS[m[2]] || '01';
    const year = m[3];
    const hour = String(parseInt(m[4], 10)).padStart(2, '0');
    const minute = m[5];

    const isoWithOffset = `${year}-${month}-${day}T${hour}:${minute}:00+06:00`;
    const ts = Date.parse(isoWithOffset);
    return Number.isNaN(ts) ? 0 : ts;
  }

  function toTimestamp(value) {
    const ts = Date.parse(String(value || ''));
    return Number.isNaN(ts) ? 0 : ts;
  }

  if (source) {
    articles = articles.filter(article => itemMatchesSource(article, source));
  }

  if (category) {
    articles = articles.filter(article => article.category && article.category.includes(category));
  }

  if (search) {
    const query = String(search).toLowerCase();
    articles = articles.filter(article =>
      [article.title, article.excerpt, article.bodyText]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query))
    );
  }

  if (from) {
    const fromDate = new Date(from);
    articles = articles.filter(article => article.publishedAt && new Date(article.publishedAt) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    articles = articles.filter(article => article.publishedAt && new Date(article.publishedAt) <= toDate);
  }

  const sortOrder = String(sort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  // Sort by published time (fallback: scraped time) with configurable order.
  articles.sort((a, b) => {
    const bTs = Math.max(
      toTimestamp(b?.publishedAt),
      parseBanglaPublishedText(b?.publishedText),
      toTimestamp(b?.scrapedAt)
    );
    const aTs = Math.max(
      toTimestamp(a?.publishedAt),
      parseBanglaPublishedText(a?.publishedText),
      toTimestamp(a?.scrapedAt)
    );
    return sortOrder === 'asc' ? aTs - bTs : bTs - aTs;
  });

  const total = articles.length;
  const pageNum = Number.parseInt(page, 10) || 1;
  const limitNum = clampPageLimit(limit, 20);
  const start = (pageNum - 1) * limitNum;
  const paginated = articles.slice(start, start + limitNum);

  res.json({
    articles: paginated,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
    sort: sortOrder,
  });
});

app.get('/api/mobiles', (req, res) => {
  const { page = 1, limit = 20, brand, category, status, search, source } = req.query;
  let mobiles = readMobilesCache();

  if (source) {
    mobiles = mobiles.filter(item => itemMatchesSource(item, source));
  }

  if (brand) {
    mobiles = mobiles.filter(item => item.brand && item.brand.includes(brand));
  }

  if (category) {
    mobiles = mobiles.filter(item => (item.productCategory || item.category) && (item.productCategory || item.category).includes(category));
  }

  if (status) {
    mobiles = mobiles.filter(item => item.status && item.status.includes(status));
  }

  if (search) {
    const query = String(search).toLowerCase();
    mobiles = mobiles.filter(item =>
      [item.title, item.excerpt, item.bodyText, item.brand, item.model]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    );
  }

  const total = mobiles.length;
  const pageNum = Number.parseInt(page, 10) || 1;
  const limitNum = clampPageLimit(limit, 20);
  const start = (pageNum - 1) * limitNum;
  const paginated = mobiles.slice(start, start + limitNum);

  res.json({
    mobiles: paginated,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

app.get('/api/mobiles/search', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  const found = readMobilesCache().find(item => item.url === url);
  if (!found) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(found);
});

app.get('/api/articles/search', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  const found = readCache().find(article => article.url === url);
  if (!found) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(found);
});

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

app.get('/api/cache/export', (req, res) => {
  const articles = readCache();
  res.setHeader('Content-Disposition', `attachment; filename="brox-cache-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(articles);
});

app.get('/api/mobiles/export', (req, res) => {
  const mobiles = readMobilesCache();
  res.setHeader('Content-Disposition', `attachment; filename="mobiles-cache-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(mobiles);
});

app.delete('/api/cache', (req, res) => {
  clearCache();
  res.json({ message: 'Cache cleared' });
});

app.post('/api/cron', (req, res) => {
  const {
    action,
    schedule,
    name = 'custom',
    pushUrl,
    pushArticlesUrl,
    pushMobilesUrl,
    pushHeaders,
    pushEnabled,
    pushArticlesEnabled,
    pushMobilesEnabled,
    source,
    maxItems,
    delayMs,
  } = req.body || {};

  if (action === 'start') {
    if (!schedule || !cron.validate(schedule)) {
      return res.status(400).json({ error: 'Invalid cron schedule' });
    }

    startCronJob(schedule, name, {
      pushUrl,
      pushArticlesUrl,
      pushMobilesUrl,
      pushHeaders,
      pushEnabled,
      pushArticlesEnabled,
      pushMobilesEnabled,
      source,
      maxItems,
      delayMs,
    });
    return res.json({ message: `Cron job "${name}" started`, schedule, jobs: listCronJobs() });
  }

  if (action === 'stop') {
    const stopped = stopCronJob(name);
    return res.json({ message: stopped ? `Cron job "${name}" stopped` : 'Job not found', jobs: listCronJobs() });
  }

  if (action === 'list') {
    return res.json({ jobs: listCronJobs() });
  }

  return res.status(400).json({ error: 'action must be start|stop|list' });
});

app.get('/api/scrape/log', (req, res) => {
  res.json({ log: scrapeStatus.log, running: scrapeStatus.running });
});

app.get('/api/cron/logs', (req, res) => {
  const limit = clampPageLimit(req.query.limit, 50);
  const name = (req.query.name || '').toString().trim();
  const filtered = name
    ? cronRunLogs.filter(entry => String(entry.job || '') === name)
    : cronRunLogs;
  res.json({ logs: filtered.slice(-limit).reverse(), total: filtered.length, limit });
});

app.delete('/api/cron/logs', (req, res) => {
  cronRunLogs = [];
  try {
    ensureCronLogDir();
    fs.writeFileSync(CRON_LOG_FILE, '', 'utf8');
  } catch { }
  res.json({ cleared: true });
});

app.get('/api/push/logs', (req, res) => {
  const limit = clampPageLimit(req.query.limit, 100);
  const kind = (req.query.kind || '').toString().trim().toLowerCase();
  const sourceKey = (req.query.sourceKey || '').toString().trim().toLowerCase();
  const successFilter = (req.query.success || '').toString().trim().toLowerCase();

  const filtered = pushRunLogs.filter(entry => {
    if (kind && String(entry.kind || '').toLowerCase() !== kind) return false;
    if (sourceKey && String(entry.sourceKey || '').toLowerCase() !== sourceKey) return false;
    if (successFilter === 'true' && entry.success !== true) return false;
    if (successFilter === 'false' && entry.success !== false) return false;
    return true;
  });

  res.json({
    logs: filtered.slice(-limit).reverse(),
    total: filtered.length,
    limit,
  });
});

app.delete('/api/push/logs', (req, res) => {
  pushRunLogs = [];
  try {
    ensurePushLogDir();
    fs.writeFileSync(PUSH_LOG_FILE, '', 'utf8');
  } catch { }
  res.json({ cleared: true });
});

app.post('/api/push/manual', async (req, res) => {
  const { type } = req.body || {};

  if (!type || (type !== 'articles' && type !== 'mobiles' && type !== 'all')) {
    return res.status(400).json({ error: 'Invalid type. Must be "articles", "mobiles", or "all".' });
  }

  try {
    if (type === 'all') {
      const articles = readCache();
      const mobiles = readMobilesCache();

      const articlesResult = await pushItemsToEndpoint(Array.isArray(articles) ? articles : [], {
        kind: 'articles',
        trigger: 'manual-push',
      });

      const mobilesResult = await pushItemsToEndpoint(Array.isArray(mobiles) ? mobiles : [], {
        kind: 'mobiles',
        trigger: 'manual-push',
      });

      const overallSuccess =
        (!articlesResult.attempted || articlesResult.success) &&
        (!mobilesResult.attempted || mobilesResult.success);
      const totalCount = Number(articlesResult.count || 0) + Number(mobilesResult.count || 0);

      if (!overallSuccess) {
        return res.status(500).json({
          success: false,
          message: 'Failed to push one or more data types',
          result: {
            attempted: true,
            success: false,
            count: totalCount,
            articles: articlesResult,
            mobiles: mobilesResult,
          },
        });
      }

      return res.json({
        success: true,
        message: `Successfully pushed ${totalCount} items (articles + mobiles)`,
        result: {
          attempted: true,
          success: true,
          count: totalCount,
          articles: articlesResult,
          mobiles: mobilesResult,
        },
      });
    }

    let items = [];

    if (type === 'articles') {
      const cache = readCache();
      items = Array.isArray(cache) ? cache : [];
    } else {
      const cache = readMobilesCache();
      items = Array.isArray(cache) ? cache : [];
    }

    const result = await pushItemsToEndpoint(items, {
      kind: type,
      trigger: 'manual-push',
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Successfully pushed ${result.count} ${type}`,
        result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || `Failed to push ${type}`,
        result,
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error during manual push: ' + err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Brox Scraper API running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`API docs: http://localhost:${PORT}/api/status`);
  const startup = getStartupShortcutState();
  console.log(`[Startup] Shortcut ${startup.installed ? 'installed' : 'not installed'}: ${startup.shortcutPath}`);
});
