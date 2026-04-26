const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');
const { toErrorDetails } = require('./errorDetails');

const BASE_URL = 'https://www.banglatribune.com';
const LISTING_URL = `${BASE_URL}/tech-and-gadget/tech-news`;
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
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  const pathname = new URL(normalized).pathname;
  return /^\/tech-and-gadget\/\d+\/[^/]+/.test(pathname);
}

function extractLinks(root) {
  const links = new Set();

  root.querySelectorAll('#contents_10944_ajax_container a.link_overlay[href]').forEach(a => {
    const normalized = normalizeUrl(a.getAttribute('href'));
    if (isArticleUrl(normalized)) links.add(normalized);
  });

  if (!links.size) {
    root.querySelectorAll('.categoryPageListing a.link_overlay[href], .categoryPageListing .title_holder a[href]').forEach(a => {
      const normalized = normalizeUrl(a.getAttribute('href'));
      if (isArticleUrl(normalized)) links.add(normalized);
    });
  }

  return [...links].slice(0, LISTING_LIMIT);
}

async function scrapeArticleLinks() {
  const root = await fetchPage(LISTING_URL);
  return extractLinks(root);
}

function extractParagraphs(root) {
  const paragraphs = root.querySelectorAll('article.jw_detail_content_holder .jw_article_body p, .jw_article_body p');
  const unique = [];
  const seen = new Set();

  paragraphs.forEach(p => {
    const text = cleanText(p.text);
    if (!text || text.length < 2) return;

    if (
      text.includes('Google News') ||
      text.includes('news.google.com') ||
      text.includes('ফলো করুন')
    ) {
      return;
    }

    if (seen.has(text)) return;
    seen.add(text);
    unique.push(text);
  });

  return unique;
}

function parsePublishedIso(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

async function scrapeArticleDetails(url) {
  try {
    const root = await fetchPage(url);
    const detailsRoot = root.querySelector('#widget_9947 .detail_widget .jw_content_detail_each') || root;

    const canonicalEl = root.querySelector('link[rel="canonical"]');
    const canonicalUrl = normalizeUrl(canonicalEl?.getAttribute('href') || url) || url;

    const titleEl =
      detailsRoot.querySelector('h1.title') ||
      root.querySelector('h1.title') ||
      root.querySelector('h1');

    const authorEl =
      detailsRoot.querySelector('.author .name') ||
      root.querySelector('.author .name');

    const publishedEl =
      detailsRoot.querySelector('.each_row.time .tts_time[content]') ||
      root.querySelector('.tts_time[content]');

    const publishedText = cleanText(publishedEl?.text);
    const publishedAt = parsePublishedIso(publishedEl?.getAttribute('content'));

    const excerptMeta =
      root.querySelector('meta[name="description"]') ||
      root.querySelector('meta[property="og:description"]');
    const excerpt = cleanText(excerptMeta?.getAttribute('content'));

    const categoryEl =
      root.querySelector('meta[property="article:section"]') ||
      root.querySelector('.breadcrum a[href*="/tech-and-gadget"]');
    const category = cleanText(categoryEl?.getAttribute?.('content') || categoryEl?.text || 'tech-and-gadget');

    const heroImgEl =
      detailsRoot.querySelector('.featured_image img[src]') ||
      root.querySelector('.featured_image img[src]');
    const imageUrl = normalizeImageUrl(heroImgEl?.getAttribute('src') || '');

    const imageCaptionEl =
      detailsRoot.querySelector('.featured_image .jw_media_caption .cc') ||
      detailsRoot.querySelector('.featured_image .jw_media_caption');

    const tagEls = root.querySelectorAll('.content_tags .topic_list a');
    const tags = [...new Set(tagEls.map(tag => cleanText(tag.text)).filter(Boolean))];

    const bodyText = extractParagraphs(detailsRoot).join('\n\n');

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
      source: 'banglatribune',
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      errorDetails: toErrorDetails(err),
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'banglatribune',
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
    scraperSource: 'banglatribune',
  };
}

module.exports = {
  runScraper,
  scrapeArticleLinks,
  scrapeArticleDetails,
};
