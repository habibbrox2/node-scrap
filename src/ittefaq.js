const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');
const { toErrorDetails } = require('./errorDetails');

const BASE_URL = 'https://www.ittefaq.com.bd';
const LISTING_URL = `${BASE_URL}/latest-news`;
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
    if (rawUrl.startsWith('//')) {
      rawUrl = `https:${rawUrl}`;
    }

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
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  const { pathname } = new URL(normalized);
  // Ittefaq articles are typically like /785822/<slug>
  if (!/^\/\d{3,}(\/|$)/.test(pathname)) return false;

  return true;
}

function extractLinks(root) {
  const links = new Set();

  // Primary: overlay links inside listing cards
  root.querySelectorAll('a.link_overlay[href]').forEach(node => {
    const href = node.getAttribute('href');
    const normalized = normalizeUrl(href);
    if (isArticleUrl(normalized)) links.add(normalized);
  });

  // Fallback: any canonical-looking article URLs in scripts
  root.querySelectorAll('script').forEach(script => {
    const text = script.text || '';
    const matches = text.match(/https?:\\\/\\\/www\.ittefaq\.com\.bd\\\/\d{3,}\\\/[^"'\\\s]+/g) || [];
    matches.forEach(match => {
      const decoded = match.replace(/\\\//g, '/');
      const normalized = normalizeUrl(decoded);
      if (isArticleUrl(normalized)) links.add(normalized);
    });
  });

  return [...links].slice(0, LISTING_LIMIT);
}

async function scrapeArticleLinks() {
  const root = await fetchPage(LISTING_URL);
  return extractLinks(root);
}

function extractParagraphs(root) {
  const paragraphs = root.querySelectorAll('div[itemprop=\"articleBody\"] p, .jw_article_body p');
  const unique = [];
  const seen = new Set();

  paragraphs.forEach(p => {
    const text = cleanText(p.text);
    if (!text || text.length < 2) return;
    if (
      text.includes('Google News') ||
      text.includes('news.google.com') ||
      text.includes('দৈনিক ইত্তেফাকের সর্বশেষ খবর পেতে')
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

    const titleEl =
      root.querySelector('h1[itemprop=\"headline\"].title') ||
      root.querySelector('.content_detail_left h1.title') ||
      root.querySelector('h1[itemprop=\"headline\"]') ||
      root.querySelector('h1');

    const authorEl =
      root.querySelector('[itemprop=\"author\"] .name') ||
      root.querySelector('.author .name') ||
      root.querySelector('.author .name a') ||
      root.querySelector('.author');

    const publishedEl =
      root.querySelector('[itemprop=\"datePublished\"][content]') ||
      root.querySelector('.tts_time[itemprop=\"datePublished\"][content]') ||
      root.querySelector('.tts_time[content]');

    const publishedAt = cleanText(publishedEl?.getAttribute('content'));
    const publishedText = cleanText(publishedEl?.text);

    const excerptMeta = root.querySelector('meta[name=\"description\"]');
    const excerpt = cleanText(excerptMeta?.getAttribute('content'));

    const categoryMeta =
      root.querySelector('meta[property=\"article:section\"]') ||
      root.querySelector('meta[name=\"section\"]');
    const category = cleanText(categoryMeta?.getAttribute('content'));

    const imageMeta = root.querySelector('meta[itemprop=\"image\"]');
    const heroImgEl =
      root.querySelector('.featured_image img[src]') ||
      root.querySelector('.content_detail_left .featured_image img[src]') ||
      root.querySelector('img[itemprop=\"image\"][src]');

    const imageUrl = normalizeImageUrl(
      imageMeta?.getAttribute('content') || heroImgEl?.getAttribute('src') || ''
    );

    const imageCaptionEl =
      root.querySelector('.featured_image .jw_media_caption') ||
      root.querySelector('.jw_media_caption');

    const tagEls = root.querySelectorAll('.content_tags .topic_list a');
    const tags = [...new Set(tagEls.map(tag => cleanText(tag.text)).filter(Boolean))];

    const bodyText = extractParagraphs(root).join('\n\n');

    return {
      url: canonicalUrl,
      title: cleanText(titleEl?.text),
      category,
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
      source: 'ittefaq',
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      errorDetails: toErrorDetails(err),
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'ittefaq',
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
    scraperSource: 'ittefaq',
  };
}

module.exports = {
  runScraper,
  scrapeArticleLinks,
  scrapeArticleDetails,
};
