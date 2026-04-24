const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');

const BASE_URL = 'https://www.dainikshiksha.com';
const LISTING_URL = `${BASE_URL}/bn/page/latest-news`;
const ARCHIVE_DIR_URL = `${BASE_URL}/data/bn/archive/`;
const LISTING_LIMIT = parseInt(process.env.SCRAPER_LISTING_LIMIT || '20', 10);

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

  return links.slice(0, LISTING_LIMIT);
}

async function scrapeArticleLinks() {
  const overrideDate = cleanText(process.env.SCRAPER_DAINIKSHIKSHA_DATE || process.env.SCRAPER_ARCHIVE_DATE);
  const date =
    overrideDate ||
    new Date().toLocaleString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).slice(0, 10);

  const archiveUrl = `${ARCHIVE_DIR_URL}${date}.json?_t=${Math.floor(Date.now() / 10000)}`;

  try {
    const payload = await fetchJson(archiveUrl);
    const links = (payload.news || [])
      .map(item => normalizeUrl(item.url))
      .filter(Boolean);
    return [...new Set(links)].slice(0, LISTING_LIMIT);
  } catch {
    // Fallback to HTML parsing (may be template shell for bots, but try anyway).
    const root = await fetchPage(LISTING_URL);
    return extractListingLinks(root);
  }
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
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'dainikshiksha',
    };
  }
}

async function runScraper(onProgress) {
  const results = [];
  const errors = [];

  onProgress?.({ stage: 'listing', message: 'Fetching article list with curl...' });
  const links = await scrapeArticleLinks();
  onProgress?.({ stage: 'listing', message: `Found ${links.length} article links`, count: links.length });

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

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return {
    articles: results,
    errors,
    total: links.length,
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
