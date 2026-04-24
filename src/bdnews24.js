const { parse } = require('node-html-parser');
const { curlGet, curlPostForm } = require('./curl');

const BASE_URL = 'https://bangla.bdnews24.com';
const LISTING_URL = `${BASE_URL}/special`;
const LOAD_MORE_URL = `${BASE_URL}/cat-load-more`;
const LISTING_LIMIT = parseInt(process.env.SCRAPER_LISTING_LIMIT || '20', 10);
const LISTING_MAX_PAGES = parseInt(process.env.SCRAPER_BDNEWS24_MAX_PAGES || '5', 10);

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

function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;

    const resolved = new URL(rawUrl, BASE_URL);
    if (resolved.origin !== BASE_URL) return null;
    resolved.hash = '';
    resolved.search = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

function isArticleUrl(url) {
  if (!url) return false;
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  const pathname = new URL(normalized).pathname;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;

  if (
    pathname.startsWith('/topic/') ||
    pathname.startsWith('/special') ||
    pathname.startsWith('/tag/') ||
    pathname.startsWith('/author/')
  ) {
    return false;
  }

  return true;
}

function parseBdDateToIso(value) {
  const text = cleanText(value);
  if (!text) return '';

  // Example: 20 Apr 2026, 01:47 AM
  const m = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  const monthMap = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  const day = String(parseInt(m[1], 10)).padStart(2, '0');
  const month = monthMap[m[2].toLowerCase()] || '01';
  const year = m[3];
  let hour = parseInt(m[4], 10);
  const minute = m[5];
  const meridiem = m[6].toUpperCase();

  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  const isoWithOffset = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+06:00`;
  const parsed = new Date(isoWithOffset);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function extractLinks(root) {
  const links = new Set();

  root.querySelectorAll('section.Cat-readMore #data-wrapper a[href]').forEach(a => {
    const normalized = normalizeUrl(a.getAttribute('href'));
    if (isArticleUrl(normalized)) links.add(normalized);
  });

  if (!links.size) {
    root.querySelectorAll('#data-wrapper a[href], .readMore-wrapper a[href]').forEach(a => {
      const normalized = normalizeUrl(a.getAttribute('href'));
      if (isArticleUrl(normalized)) links.add(normalized);
    });
  }

  return [...links].slice(0, LISTING_LIMIT);
}

function extractLoadMoreConfig(root) {
  const slug = cleanText(root.querySelector('#catSlug')?.getAttribute('value') || 'special');
  const posCatIDs = cleanText(root.querySelector('#posCatID')?.getAttribute('value') || '');
  const nextCursor = cleanText(root.querySelector('#next-cursor')?.getAttribute('value') || '');

  let token = '';
  root.querySelectorAll('script').some(script => {
    const text = script.text || '';
    if (!text) return false;
    const m = text.match(/_token:\s*['"]([^'"]+)['"]/);
    if (!m || !m[1]) return false;
    token = m[1];
    return true;
  });

  return { slug, posCatIDs, nextCursor, token };
}

async function fetchLoadMorePayload({ slug, posCatIDs, cursor, token }) {
  const responseText = await curlPostForm(LOAD_MORE_URL, {
    _token: token,
    slug,
    posCatIDs,
    cursor,
  }, {
    headers: {
      Referer: LISTING_URL,
      Origin: BASE_URL,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json,text/javascript,*/*;q=0.01',
    },
    timeout: 25000,
  });

  if (typeof responseText === 'string' && responseText.includes('Just a moment')) {
    throw new Error('Cloudflare challenge blocked load-more endpoint');
  }

  return JSON.parse(responseText || '{}');
}

async function scrapeArticleLinks() {
  const root = await fetchPage(LISTING_URL);
  const links = new Set(extractLinks(root));
  const config = extractLoadMoreConfig(root);

  let cursor = config.nextCursor;
  const pageLimit = Number.isFinite(LISTING_MAX_PAGES) && LISTING_MAX_PAGES > 0 ? LISTING_MAX_PAGES : 1;

  for (let page = 2; page <= pageLimit && cursor && links.size < LISTING_LIMIT; page += 1) {
    try {
      const payload = await fetchLoadMorePayload({
        slug: config.slug || 'special',
        posCatIDs: config.posCatIDs || '',
        cursor,
        token: config.token || '',
      });

      const html = payload?.html || '';
      const nextCursor = cleanText(payload?.nextCursor || '');
      if (!html) break;

      const pageRoot = parse(`<div id="data-wrapper">${html}</div>`);
      extractLinks(pageRoot).forEach(link => links.add(link));

      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    } catch {
      break;
    }
  }

  return [...links].slice(0, LISTING_LIMIT);
}

function extractParagraphs(root) {
  const paragraphs = root.querySelectorAll('#contentDetails p, .details-brief p');
  const unique = [];
  const seen = new Set();

  paragraphs.forEach(p => {
    const text = cleanText(p.text);
    if (!text || text.length < 2) return;
    if (
      text.includes('গুগল নিউজে') ||
      text.includes('Google News') ||
      text.includes('Follow')
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
    const detailsRoot = root.querySelector('section.Deatils-wrapper') || root;

    const canonicalEl = root.querySelector('link[rel="canonical"]');
    const canonicalUrl = normalizeUrl(canonicalEl?.getAttribute('href') || url) || url;

    const titleEl =
      detailsRoot.querySelector('.details-title h1') ||
      detailsRoot.querySelector('h1');
    const excerptEl =
      detailsRoot.querySelector('.details-title h2') ||
      root.querySelector('meta[name="description"]');

    const categoryEl =
      detailsRoot.querySelector('.breadcrump ul li:last-child a') ||
      detailsRoot.querySelector('.breadcrump a[href*="/"]');

    const authorEls = detailsRoot.querySelectorAll('.detail-author-name .author');
    const author = [...new Set(authorEls.map(node => cleanText(node.text)).filter(Boolean))].join(', ');

    const publishedText =
      cleanText(detailsRoot.querySelector('.pub-up .pub + span')?.text) ||
      cleanText(detailsRoot.querySelector('.pub-up p span:last-child')?.text);
    const publishedAt = parseBdDateToIso(publishedText);

    const heroImgEl = detailsRoot.querySelector('.details-img img[src]');
    const imageUrl = normalizeImageUrl(heroImgEl?.getAttribute('src') || '');
    const imageCaptionEl = detailsRoot.querySelector('.details-img-caption span');

    const tagEls = detailsRoot.querySelectorAll('.DTag-area a');
    const tags = [...new Set(tagEls.map(node => cleanText(node.text)).filter(Boolean))];

    const bodyText = extractParagraphs(detailsRoot).join('\n\n');

    return {
      url: canonicalUrl,
      title: cleanText(titleEl?.text),
      category: cleanText(categoryEl?.text),
      author: cleanText(author),
      publishedAt,
      publishedText,
      excerpt: cleanText(excerptEl?.text || excerptEl?.getAttribute?.('content')),
      imageUrl,
      imageCaption: cleanText(imageCaptionEl?.text),
      bodyText,
      tags,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'bdnews24',
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'bdnews24',
    };
  }
}

async function runScraper(onProgress, options = {}) {
  const results = [];
  const errors = [];
  const maxItems = Number.parseInt(options.maxItems, 10);
  const delayMs = Number.parseInt(options.delayMs, 10);
  const sleepMs = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 300;

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
    const articleUrl = links[index];
    onProgress?.({
      stage: 'article',
      message: `Scraping article ${index + 1}/${links.length}`,
      url: articleUrl,
      index,
    });

    const article = await scrapeArticleDetails(articleUrl);
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
    scraperSource: 'bdnews24',
  };
}

module.exports = {
  runScraper,
  scrapeArticleLinks,
  scrapeArticleDetails,
};
