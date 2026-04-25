const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');
const { toErrorDetails } = require('./errorDetails');

const BASE_URL = 'https://www.dainikshiksha.com';
const LISTING_URL = `${BASE_URL}/bn/page/latest-news`;
const ARCHIVE_DIR_URL = `${BASE_URL}/data/bn/archive/`;
const LISTING_LIMIT = parseInt(process.env.SCRAPER_LISTING_LIMIT || '20', 10);
const ARCHIVE_LOOKBACK_DAYS = parseInt(process.env.SCRAPER_DAINIKSHIKSHA_ARCHIVE_LOOKBACK_DAYS || '7', 10);
const LISTING_SOURCE_FILTER = (process.env.SCRAPER_DAINIKSHIKSHA_LISTING_SOURCE || '')
  .split(',')
  .map(value => cleanText(value).toLowerCase())
  .filter(Boolean);

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: BASE_URL,
  Connection: 'keep-alive',
};

function fetchPage(url) {
  return curlGet(url, {
    headers: FETCH_HEADERS,
    timeout: 20000,
  }).then(html => parse(html));
}

async function fetchJson(url) {
  const jsonText = await curlGet(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: 'application/json,text/plain,*/*',
    },
    timeout: 20000,
  });

  return JSON.parse(jsonText);
}

function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    const resolved = new URL(rawUrl, BASE_URL);
    if (resolved.origin !== BASE_URL) return null;
    resolved.hash = '';
    resolved.search = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function parseDateToIso(value) {
  const text = cleanText(value);
  if (!text) return '';

  const ddmmyyyy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ddmmyyyy) {
    const [, day, month, year, hourStr, minute, meridiem] = ddmmyyyy;
    let hour = parseInt(hourStr, 10);
    if (meridiem.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;

    const isoWithOffset = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+06:00`;
    const parsedFixed = new Date(isoWithOffset);
    if (!Number.isNaN(parsedFixed.getTime())) return parsedFixed.toISOString();
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function extractLinksFromArchivePayload(payload) {
  const links = [];

  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== 'object') return;

    const maybeUrl = normalizeUrl(
      node.url ||
      node.news_url ||
      node.details_url ||
      node.link ||
      node.href
    );

    if (maybeUrl && maybeUrl.includes('/bn/news/')) {
      const itemSource = cleanText(node.source || node.portal || node.site || '').toLowerCase();
      if (LISTING_SOURCE_FILTER.length && !LISTING_SOURCE_FILTER.includes(itemSource)) {
        // Skip if source filter is configured and current item source does not match.
      } else {
        links.push(maybeUrl);
      }
    }

    Object.values(node).forEach(walk);
  }

  walk(payload);
  return [...new Set(links)];
}

function formatDateYmd(dateObj) {
  return dateObj.toLocaleString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).slice(0, 10);
}

async function fetchArchiveLinksByDate(date) {
  const archiveUrl = `${ARCHIVE_DIR_URL}${date}.json?_t=${Math.floor(Date.now() / 10000)}`;
  const payload = await fetchJson(archiveUrl);
  return extractLinksFromArchivePayload(payload);
}

function extractListingLinks(root) {
  const links = [];
  const seen = new Set();

  // Main listing cards
  root.querySelectorAll('a.news-card.news-card-grid[href]').forEach(a => {
    const normalized = normalizeUrl(a.getAttribute('href'));
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    links.push(normalized);
  });

  // Fallback: any /bn/news/ links
  if (links.length === 0) {
    root.querySelectorAll('a[href*=\"/bn/news/\"]').forEach(a => {
      const normalized = normalizeUrl(a.getAttribute('href'));
      if (!normalized) return;
      if (!normalized.includes('/bn/news/')) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      links.push(normalized);
    });
  }

  // Fallback: links embedded in scripts/JSON
  if (links.length === 0) {
    root.querySelectorAll('script').forEach(script => {
      const text = script.text || '';
      if (!text) return;
      const matches = text.match(/https?:\/\/www\.dainikshiksha\.com\/bn\/news\/[^"'\\\s<]+/g) || [];
      matches.forEach(match => {
        const normalized = normalizeUrl(match);
        if (!normalized) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        links.push(normalized);
      });
    });
  }

  return links.slice(0, LISTING_LIMIT);
}

async function scrapeArticleLinks() {
  const overrideDate = cleanText(process.env.SCRAPER_DAINIKSHIKSHA_DATE || process.env.SCRAPER_ARCHIVE_DATE);
  const collected = new Set();

  if (overrideDate) {
    try {
      const links = await fetchArchiveLinksByDate(overrideDate);
      links.forEach(link => collected.add(link));
    } catch {
      // Keep fallback path below.
    }
  } else {
    const lookbackDays = Number.isFinite(ARCHIVE_LOOKBACK_DAYS) && ARCHIVE_LOOKBACK_DAYS >= 0
      ? ARCHIVE_LOOKBACK_DAYS
      : 7;

    for (let dayOffset = 0; dayOffset <= lookbackDays && collected.size < LISTING_LIMIT; dayOffset += 1) {
      const dateObj = new Date();
      dateObj.setDate(dateObj.getDate() - dayOffset);
      const date = formatDateYmd(dateObj);

      try {
        const links = await fetchArchiveLinksByDate(date);
        links.forEach(link => collected.add(link));
      } catch {
        // Ignore missing dates (404) and continue to previous day.
      }
    }
  }

  if (collected.size > 0) {
    return [...collected].slice(0, LISTING_LIMIT);
  }

  // Fallback to HTML parsing (may be template shell for bots, but try anyway).
  const root = await fetchPage(LISTING_URL);
  return extractListingLinks(root);
}

function extractParagraphs(root) {
  const paragraphs = root.querySelectorAll('article[itemprop=\"articleBody\"], article.news-content[itemprop=\"articleBody\"], article.news-content')
    .flatMap(article => article.querySelectorAll('p'));

  const unique = [];
  const seen = new Set();

  paragraphs.forEach(p => {
    const text = cleanText(p.text);
    if (!text || text.length < 2) return;

    const lower = text.toLowerCase();
    if (
      lower.includes('sub_confirmation=1') ||
      lower.includes('youtube') ||
      text.includes('ইউটিউব') ||
      text.includes('সাবস্ক্রাইব') ||
      text.includes('গুগল নিউজ') ||
      text.includes('Google News')
    ) {
      return;
    }

    if (seen.has(text)) return;
    seen.add(text);
    unique.push(text);
  });

  return unique;
}

async function scrapeArticleDetails(url) {
  try {
    const root = await fetchPage(url);
    const canonicalEl = root.querySelector('link[rel=\"canonical\"]');
    const canonicalUrl = normalizeUrl(canonicalEl?.getAttribute('href') || url) || url;

    const detailsRoot =
      root.querySelector('.news-left-content') ||
      root.querySelector('div[class*=\"news-left-content\"]') ||
      root;

    const titleEl =
      detailsRoot.querySelector('h1[itemprop=\"headline\"]') ||
      detailsRoot.querySelector('.news-page-title') ||
      detailsRoot.querySelector('h1');

    const authorEl =
      detailsRoot.querySelector('.hero-content span.text-xl') ||
      detailsRoot.querySelector('.hero-content span') ||
      detailsRoot.querySelector('[itemprop=\"author\"]') ||
      detailsRoot.querySelector('.news-meta-container span.text-xl');

    const categoryEl =
      detailsRoot.querySelector('.news-macro-meta a[href*=\"/bn/category/\"]') ||
      detailsRoot.querySelector('a[href*=\"/bn/category/\"]');

    const publishedStrong =
      detailsRoot.querySelector('.published-date strong.convertible-datetime[data-iso-date]') ||
      detailsRoot.querySelector('strong.convertible-datetime[data-iso-date]');

    const publishedText = cleanText(publishedStrong?.text);
    const publishedAt = parseDateToIso(publishedStrong?.getAttribute('data-iso-date'));

    const excerptEl = detailsRoot.querySelector('.news-seo-summary');
    const excerpt = cleanText(excerptEl?.text);

    const tagsEls = detailsRoot.querySelectorAll('.news-tags a strong');
    const tags = [
      ...new Set(
        tagsEls
          .map(el => cleanText(el.text).replace(/^#/, ''))
          .filter(Boolean)
      ),
    ];

    const heroImgEl =
      detailsRoot.querySelector('p.news-featured-thumbnail img[src]') ||
      detailsRoot.querySelector('.news-featured-thumbnail img[src]') ||
      detailsRoot.querySelector('header img[src]') ||
      detailsRoot.querySelector('img[src*=\"files.dainikshiksha.com\"]');

    const imageUrl = normalizeImageUrl(heroImgEl?.getAttribute('src') || '');
    const imageCaptionEl = detailsRoot.querySelector('.photo-caption');

    const bodyText = extractParagraphs(detailsRoot).join('\n\n');

    return {
      url: canonicalUrl,
      title: cleanText(titleEl?.text),
      category: cleanText(categoryEl?.text),
      author: cleanText(authorEl?.text),
      publishedAt,
      publishedText,
      excerpt,
      imageUrl,
      imageCaption: cleanText(imageCaptionEl?.text),
      bodyText,
      tags,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'dainikshiksha',
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      errorDetails: toErrorDetails(err),
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'dainikshiksha',
    };
  }
}

async function runScraper(onProgress, options = {}) {
  const results = [];
  const errors = [];
  const maxItems = Number.parseInt(options.maxItems, 10);
  const delayMs = Number.parseInt(options.delayMs, 10);
  const sleepMs = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 250;

  onProgress?.({ stage: 'listing', message: 'Fetching article list with curl...' });
  const allLinks = await scrapeArticleLinks();
  const links =
    Number.isFinite(maxItems) && maxItems > 0
      ? allLinks.slice(0, maxItems)
      : allLinks;

  onProgress?.({ stage: 'listing', message: `Found ${allLinks.length} article links`, count: allLinks.length });
  if (links.length !== allLinks.length) {
    onProgress?.({ stage: 'listing', message: `Limiting scrape to ${links.length} items`, count: links.length });
  }

  for (let index = 0; index < links.length; index += 1) {
    const url = links[index];
    onProgress?.({
      stage: 'article',
      message: `Scraping article ${index + 1}/${links.length}`,
      url,
      index,
    });

    const article = await scrapeArticleDetails(url);
    if (article.error || !article.title || !article.bodyText) {
      errors.push(article);
    } else {
      results.push(article);
    }

    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  return {
    articles: results,
    errors,
    total: links.length,
    found: allLinks.length,
    success: results.length,
    failed: errors.length,
    source: LISTING_URL,
    fetchMethod: 'curl',
    scraperSource: 'dainikshiksha',
  };
}

module.exports = {
  runScraper,
  scrapeArticleLinks,
  scrapeArticleDetails,
};
