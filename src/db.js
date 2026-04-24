const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DB_FILE = path.join(CACHE_DIR, 'brox.sqlite');

let db = null;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getDb() {
  if (db) return db;
  ensureCacheDir();
  db = new DatabaseSync(DB_FILE);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS content_items (
      url TEXT PRIMARY KEY,
      contentType TEXT NOT NULL,
      sourceKey TEXT,
      title TEXT,
      publishedAt TEXT,
      scrapedAt TEXT,
      updatedAt TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(contentType);
    CREATE INDEX IF NOT EXISTS idx_content_items_source ON content_items(sourceKey);
    CREATE INDEX IF NOT EXISTS idx_content_items_published ON content_items(publishedAt);

    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runAt TEXT NOT NULL,
      trigger TEXT,
      sourceKey TEXT,
      total INTEGER,
      success INTEGER,
      failed INTEGER,
      pushed INTEGER,
      pushSuccess INTEGER,
      pushedCount INTEGER,
      pushUrl TEXT,
      payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scrape_runs_runAt ON scrape_runs(runAt);
  `);

  return db;
}

function upsertContentItems(items, context = {}) {
  const database = getDb();
  if (!Array.isArray(items) || !items.length) return { insertedOrUpdated: 0 };

  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO content_items (
      url, contentType, sourceKey, title, publishedAt, scrapedAt, updatedAt, payload
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(url) DO UPDATE SET
      contentType=excluded.contentType,
      sourceKey=excluded.sourceKey,
      title=excluded.title,
      publishedAt=excluded.publishedAt,
      scrapedAt=excluded.scrapedAt,
      updatedAt=excluded.updatedAt,
      payload=excluded.payload
  `);

  let count = 0;
  database.exec('BEGIN');
  try {
    for (const item of items) {
      if (!item || !item.url) continue;
      const contentType = item.contentType || 'article';
      const itemSourceKey = item.sourceKey || context.sourceKey || null;
      stmt.run(
        String(item.url),
        String(contentType),
        itemSourceKey ? String(itemSourceKey) : null,
        item.title ? String(item.title) : null,
        item.publishedAt ? String(item.publishedAt) : null,
        item.scrapedAt ? String(item.scrapedAt) : now,
        now,
        JSON.stringify(item)
      );
      count += 1;
    }
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  return { insertedOrUpdated: count };
}

function insertScrapeRun(runResult) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO scrape_runs (
      runAt, trigger, sourceKey, total, success, failed, pushed, pushSuccess, pushedCount, pushUrl, payload
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const runAt = new Date().toISOString();
  const pushResult = runResult && runResult.pushResult ? runResult.pushResult : {};
  const pushArticles = pushResult.articles || {};
  const pushMobiles = pushResult.mobiles || {};
  const pushUrl = pushResult.url || pushArticles.url || pushMobiles.url || null;
  stmt.run(
    runAt,
    runResult && runResult.trigger ? String(runResult.trigger) : null,
    runResult && runResult.sourceKey ? String(runResult.sourceKey) : null,
    runResult && runResult.total != null ? Number(runResult.total) : null,
    runResult && runResult.success != null ? Number(runResult.success) : null,
    runResult && runResult.failed != null ? Number(runResult.failed) : null,
    pushResult.attempted ? 1 : 0,
    pushResult.success ? 1 : 0,
    pushResult.count != null ? Number(pushResult.count) : 0,
    pushUrl,
    JSON.stringify(runResult || {})
  );
}

module.exports = {
  getDb,
  upsertContentItems,
  insertScrapeRun,
  DB_FILE,
};
