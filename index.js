const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const { curlPostJson } = require('./src/curl');
const {
  readCache,
  readMobilesCache,
  saveToCache,
  saveMobilesToCache,
  updateMeta,
  clearCache,
  getStats,
} = require('./src/cache');
const { getScraper, listSources } = require('./src/scrapers');

const app = express();
const PORT = process.env.PORT || 9999;
const DEFAULT_CRON_SCHEDULE = process.env.SCRAPER_CRON_SCHEDULE || '0 * * * *';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let scrapeStatus = {
  running: false,
  trigger: null,
  startedAt: null,
  log: [],
  lastResult: null,
};

function parseJsonEnv(value, fallback = {}) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getPushConfig(overrides = {}) {
  const endpointUrl = overrides.pushUrl || process.env.PUSH_ENDPOINT_URL || '';
  const headers = {
    ...parseJsonEnv(process.env.PUSH_ENDPOINT_HEADERS_JSON, {}),
    ...(overrides.pushHeaders || {}),
  };

  return {
    url: endpointUrl,
    headers,
    enabled: Boolean(endpointUrl),
  };
}

async function pushArticlesToEndpoint(articles, options = {}) {
  const pushConfig = getPushConfig(options);

  if (!pushConfig.enabled) {
    return {
      attempted: false,
      success: false,
      count: 0,
      url: null,
      message: 'Push endpoint not configured',
    };
  }

  if (!articles.length) {
    return {
      attempted: true,
      success: true,
      count: 0,
      url: pushConfig.url,
      message: 'No new articles to push',
    };
  }

  const payload = {
    source: options.sourceKey || 'brox',
    trigger: options.trigger || 'manual',
    pushedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  try {
    const responseText = await curlPostJson(pushConfig.url, payload, {
      headers: pushConfig.headers,
      timeout: parseInt(process.env.PUSH_ENDPOINT_TIMEOUT_MS || '30000', 10),
    });

    return {
      attempted: true,
      success: true,
      count: articles.length,
      url: pushConfig.url,
      responseText: responseText.trim().slice(0, 1000),
    };
  } catch (err) {
    return {
      attempted: true,
      success: false,
      count: articles.length,
      url: pushConfig.url,
      error: err.message,
    };
  }
}

async function executeScrape(trigger = 'manual', options = {}) {
  if (scrapeStatus.running) {
    return { error: 'Scraper is already running', status: scrapeStatus };
  }

  const sourceKey = (options.source || process.env.SCRAPER_SOURCE || 'prothomalo')
    .toString()
    .trim()
    .toLowerCase();

  const runAllSources = sourceKey === 'all' || sourceKey === '*';
  const sourcesToRun = runAllSources ? listSources() : [sourceKey];

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
    const pushItems = [];

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
        });

        perSource[runKey] = result;
        combinedTotal += Number(result.total || 0);
        combinedSuccess += Number(result.success || 0);
        combinedFailed += Number(result.failed || 0);
        if (Array.isArray(result.errors) && result.errors.length) {
          combinedErrors.push(...result.errors.map(err => ({ ...err, sourceKey: runKey })));
        }

        const allItems = result.articles || [];
        const mobiles = allItems.filter(item => item?.contentType === 'mobile');
        const articles = allItems.filter(item => item?.contentType !== 'mobile');

        const cacheResult = saveToCache(articles);
        const mobileCacheResult = saveMobilesToCache(mobiles);

        combinedAddedToCache += Number(cacheResult.added || 0);
        combinedUpdatedInCache += Number(cacheResult.updated || 0);
        combinedAddedMobilesToCache += Number(mobileCacheResult.added || 0);
        combinedUpdatedMobilesInCache += Number(mobileCacheResult.updated || 0);

        pushItems.push(
          ...(cacheResult.newArticles || []),
          ...(mobileCacheResult.newItems || [])
        );
      } catch (err) {
        const errorEntry = {
          error: err.message,
          sourceKey: runKey,
        };
        perSource[runKey] = errorEntry;
        combinedErrors.push(errorEntry);

        scrapeStatus.log.push({
          time: new Date().toISOString(),
          stage: 'error',
          message: `Source failed: ${runKey} (${err.message})`,
          sourceKey: runKey,
        });
      }
    }

    const pushResult = await pushArticlesToEndpoint(pushItems, {
      trigger,
      pushUrl: options.pushUrl,
      pushHeaders: options.pushHeaders,
      sourceKey: runAllSources ? 'all' : sourceKey,
    });

    const stats = getStats();

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
      pushedArticles: pushResult.count,
      pushResult,
      trigger,
      sourceKey: runAllSources ? 'all' : sourceKey,
      sourcesRun: sourcesToRun,
    };

    updateMeta(finalResult);
    scrapeStatus.lastResult = finalResult;
    scrapeStatus.running = false;

    console.log(
      `[Scraper] Done - ${finalResult.success}/${finalResult.total} items, +${finalResult.addedToCache} articles, +${finalResult.addedMobilesToCache} mobiles, push attempted: ${pushResult.attempted}`
    );

    return finalResult;
  } catch (err) {
    console.error('[Scraper] Error:', err.message);
    scrapeStatus.running = false;
    scrapeStatus.lastResult = { error: err.message };
    throw err;
  }
}

const cronJobs = {};

function startCronJob(schedule, name, options = {}) {
  if (cronJobs[name]) {
    cronJobs[name].task.stop();
  }

  const task = cron.schedule(schedule, async () => {
    console.log(`[Cron:${name}] Triggered at ${new Date().toISOString()}`);
    try {
      await executeScrape(`cron:${name}`, options);
    } catch (err) {
      console.error(`[Cron:${name}] Failed:`, err.message);
    }
  });

  cronJobs[name] = {
    task,
    schedule,
    options,
  };

  console.log(`[Cron] Job "${name}" started with schedule: ${schedule}`);
}

function stopCronJob(name) {
  if (!cronJobs[name]) {
    return false;
  }

  cronJobs[name].task.stop();
  delete cronJobs[name];
  return true;
}

startCronJob(DEFAULT_CRON_SCHEDULE, 'hourly');

app.get('/api/status', (req, res) => {
  const stats = getStats();
  res.json({
    scraper: scrapeStatus,
    cache: stats,
    activeCrons: Object.fromEntries(
      Object.entries(cronJobs).map(([name, job]) => [name, { schedule: job.schedule }])
    ),
    push: getPushConfig(),
    sources: listSources(),
    defaultSource: (process.env.SCRAPER_SOURCE || 'prothomalo').toString(),
  });
});

app.post('/api/scrape', async (req, res) => {
  if (scrapeStatus.running) {
    return res.status(409).json({ error: 'Scraper already running', status: scrapeStatus });
  }

  const { pushUrl, pushHeaders, source } = req.body || {};

  res.json({
    message: 'Scrape started',
    trigger: 'manual',
    startedAt: new Date().toISOString(),
    pushEnabled: Boolean(pushUrl || process.env.PUSH_ENDPOINT_URL),
    source: source || process.env.SCRAPER_SOURCE || 'prothomalo',
  });

  executeScrape('manual', { pushUrl, pushHeaders, source }).catch(err => {
    console.error('Manual scrape error:', err.message);
  });
});

app.get('/api/articles', (req, res) => {
  const { page = 1, limit = 20, category, search, from, to } = req.query;
  let articles = readCache();

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

  const total = articles.length;
  const pageNum = Number.parseInt(page, 10) || 1;
  const limitNum = Number.parseInt(limit, 10) || 20;
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
  });
});

app.get('/api/mobiles', (req, res) => {
  const { page = 1, limit = 20, brand, category, status, search } = req.query;
  let mobiles = readMobilesCache();

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
  const limitNum = Number.parseInt(limit, 10) || 20;
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
  const { action, schedule, name = 'custom', pushUrl, pushHeaders, source } = req.body || {};

  if (action === 'start') {
    if (!schedule || !cron.validate(schedule)) {
      return res.status(400).json({ error: 'Invalid cron schedule' });
    }

    startCronJob(schedule, name, { pushUrl, pushHeaders, source });
    return res.json({ message: `Cron job "${name}" started`, schedule });
  }

  if (action === 'stop') {
    const stopped = stopCronJob(name);
    return res.json({ message: stopped ? `Cron job "${name}" stopped` : 'Job not found' });
  }

  if (action === 'list') {
    return res.json({
      jobs: Object.fromEntries(
        Object.entries(cronJobs).map(([jobName, job]) => [jobName, { schedule: job.schedule }])
      ),
    });
  }

  return res.status(400).json({ error: 'action must be start|stop|list' });
});

app.get('/api/scrape/log', (req, res) => {
  res.json({ log: scrapeStatus.log, running: scrapeStatus.running });
});

app.listen(PORT, () => {
  console.log(`Brox Scraper API running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`API docs: http://localhost:${PORT}/api/status`);
});
