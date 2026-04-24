const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');

const BASE_URL = 'https://www.prothomalo.com';
const LISTING_URL = `${BASE_URL}/collection/latest`;
const LISTING_LIMIT = parseInt(process.env.SCRAPER_LISTING_LIMIT || '20', 10);
const LISTING_API_URL = `${BASE_URL}/api/v1/advanced-search`;
const DETAILS_ROOT_SELECTORS = [
  '.story-content-wrapper.jzPe6',
  '.story-content-wrapper',
];
const LISTING_HTML_SELECTORS = [
  '._9rLDm .left_image_right_news .left-image a[href]',
  '._9rLDm .left_image_right_news .content-area .title-link[href]',
  '._9rLDm .left_image_right_news .content-area .excerpt[href]',
  '._9rLDm .news_item_content a[href]',
  '.Ib8Zz a[href]',
  '.wide-story-card a[href]',
  '.news_with_item a[href]',
  '.headline-title a[href]',
  '.title-link[href]',
  'a.title-link[href]',
];

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: BASE_URL,
  Connection: 'keep-alive',
};

const SKIP_PATH_PREFIXES = [
  '/collection',
  '/topic',
  '/podcast',
  '/epaper',
  '/login',
  '/search',
  '/photo',
  '/cartoon',
  '/author',
  '/archive',
  '/tag',
];

function fetchPage(url) {
  return curlGet(url, {
    headers: FETCH_HEADERS,
    timeout: 20000,
  }).then(html => parse(html));
}

async function fetchJson(url) {
  const json = await curlGet(url, {
    headers: {
      ...FETCH_HEADERS,
      Accept: 'application/json,text/plain,*/*',
    },
    timeout: 20000,
  });

  return JSON.parse(json);
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    if (rawUrl.startsWith('//')) {
      return `https:${rawUrl}`;
    }

    const resolved = new URL(rawUrl, BASE_URL);

    if (resolved.origin !== BASE_URL) {
      return null;
    }

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

  const { pathname } = new URL(normalized);

  if (SKIP_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  return segments.length >= 2;
}

function extractLinksFromSelectors(root, selectors) {
  const links = [];

  selectors.forEach(selector => {
    root.querySelectorAll(selector).forEach(node => {
      const href = node.getAttribute('href');
      const normalized = normalizeUrl(href);
      if (isArticleUrl(normalized)) {
        links.push(normalized);
      }
    });
  });

  return links;
}

function extractLinksFromScripts(root) {
  const links = [];
  const scripts = root.querySelectorAll('script[type="application/ld+json"], script');

  scripts.forEach(script => {
    const text = script.text || '';
    const matches = text.match(/https:\\\/\\\/www\.prothomalo\.com\\\/[^"'\\\s]+/g) || [];

    matches.forEach(match => {
      const decoded = match.replace(/\\\//g, '/');
      const normalized = normalizeUrl(decoded);
      if (isArticleUrl(normalized)) {
        links.push(normalized);
      }
    });
  });

  return links;
}

async function scrapeArticleLinks() {
  const root = await fetchPage(LISTING_URL);
  const links = new Set([
    ...extractLinksFromSelectors(root, LISTING_HTML_SELECTORS),
    ...extractLinksFromScripts(root),
  ]);

  if (links.size > 0) {
    return [...links].slice(0, LISTING_LIMIT);
  }

  const fields = [
    'headline',
    'slug',
    'url',
    'published-at',
    'sections',
    'story-template',
  ].join(',');

  const apiUrl = `${LISTING_API_URL}?limit=${LISTING_LIMIT}&offset=0&sort=latest-published&fields=${encodeURIComponent(fields)}`;
  const payload = await fetchJson(apiUrl);

  return [...new Set(
    (payload.items || [])
      .map(item => normalizeUrl(item.url))
      .filter(url => isArticleUrl(url))
  )];
}

function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function stripHtml(html) {
  if (!html) return '';
  const root = parse(`<div>${html}</div>`);
  return cleanText(root.text);
}

function findFirst(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function queryAllWithin(root, selectors) {
  for (const selector of selectors) {
    const nodes = root.querySelectorAll(selector);
    if (nodes.length > 0) return nodes;
  }
  return [];
}

function extractParagraphs(root) {
  const paragraphs = queryAllWithin(root, [
    '.story-content.no-key-elements .VzzDZ .story-element-text p',
    '.story-content.no-key-elements .story-element-text p',
    '.VzzDZ .story-element-text p',
    '.story-element-text p',
  ]);
  const unique = [];
  const seen = new Set();

  paragraphs.forEach(paragraph => {
    const text = cleanText(paragraph.text);
    if (!text || text.length < 2) return;
    if (seen.has(text)) return;
    seen.add(text);
    unique.push(text);
  });

  return unique;
}

function buildImageFromApi(item) {
  if (item.heroImageUrl) return item.heroImageUrl;
  if (item.heroImageS3Key) return `https://media.prothomalo.com/${item.heroImageS3Key}`;
  if (item.heroImageMetadata?.originalUrl) return item.heroImageMetadata.originalUrl;
  return '';
}

async function fetchArticleFallbackFromApi(url) {
  const slug = (new URL(url)).pathname.split('/').filter(Boolean).pop();
  if (!slug) return null;

  const fields = [
    'headline',
    'url',
    'cards',
    'sections',
    'published-at',
    'author-name',
    'authors',
    'tags',
    'metadata',
    'hero-image-s3-key',
    'hero-image-caption',
    'hero-image-metadata',
    'story-template',
  ].join(',');

  const apiUrl = `${LISTING_API_URL}?limit=1&q=${encodeURIComponent(slug)}&fields=${encodeURIComponent(fields)}`;
  const payload = await fetchJson(apiUrl);
  const item = (payload.items || [])[0];

  if (!item) return null;

  const paragraphs = (item.cards || [])
    .flatMap(card => card['story-elements'] || [])
    .filter(element => element.type === 'text' && element.text)
    .map(element => stripHtml(element.text))
    .filter(Boolean);

  return {
    url: normalizeUrl(item.url) || url,
    title: cleanText(item.headline),
    category: cleanText(item.sections?.[0]?.['display-name'] || item.sections?.[0]?.name),
    author: cleanText(item['author-name'] || item.authors?.[0]?.name),
    publishedAt: item['published-at'] ? new Date(item['published-at']).toISOString() : '',
    publishedText: '',
    excerpt: cleanText(item.metadata?.excerpt || item.seo?.['meta-description']),
    imageUrl: normalizeImageUrl(buildImageFromApi({
      heroImageUrl: item['hero-image-url'],
      heroImageS3Key: item['hero-image-s3-key'],
      heroImageMetadata: item['hero-image-metadata'],
    })),
    imageCaption: cleanText(item['hero-image-caption']),
    bodyText: paragraphs.join('\n\n'),
    tags: [...new Set((item.tags || []).map(tag => cleanText(tag.name)).filter(Boolean))],
    scrapedAt: new Date().toISOString(),
    fetchMethod: 'curl',
    sourceType: item['story-template'] || 'story',
  };
}

async function scrapeArticleDetails(url) {
  try {
    const root = await fetchPage(url);
    const detailsRoot = findFirst(root, DETAILS_ROOT_SELECTORS) || root;

    const titleEl = findFirst(detailsRoot, [
      '.story-head .story-title-info h1[data-title-0]',
      '.story-title-info h1[data-title-0]',
      'h1[data-title-0]',
      'h1',
    ]);
    const categoryEl = findFirst(detailsRoot, [
      '.story-head .print-entity-section-wrapper a[data-section-0]',
      '.story-title-info a[data-section-0]',
      'a[data-section-0]',
    ]);
    const authorEl = findFirst(detailsRoot, [
      '.story-metadata-wrapper [data-author-0]',
      '.author-name-location-wrapper [data-author-0]',
      '[data-author-0]',
      '.contributor-name',
    ]);
    const timeEl = findFirst(detailsRoot, [
      '.story-metadata-wrapper time[datetime]',
      '.time-social-share-wrapper time[datetime]',
      'time[datetime]',
    ]);
    const heroImgEl = findFirst(detailsRoot, [
      '.story-content .story-page-hero img',
      '.story-page-hero img',
      '.qt-image img',
    ]);
    const tagEls = queryAllWithin(detailsRoot, [
      '.print-tags .tag-list a',
      '.tag-list a',
      '[data-topic-0]',
    ]);
    const excerptMeta = root.querySelector('meta[name="description"]');
    const canonicalEl = root.querySelector('link[rel="canonical"]');
    const paragraphs = extractParagraphs(detailsRoot);
    const imageCaptionEl = findFirst(detailsRoot, [
      '.story-page-hero figcaption',
      '.story-element-image-caption',
      '.custom-gallery-image',
    ]);

    const tags = [...new Set(tagEls.map(tag => cleanText(tag.text)).filter(Boolean))];
    const bodyText = paragraphs.join('\n\n');

    const article = {
      url: normalizeUrl(canonicalEl?.getAttribute('href') || url) || url,
      title: cleanText(titleEl?.text),
      category: cleanText(categoryEl?.text),
      author: cleanText(authorEl?.text),
      publishedAt: cleanText(timeEl?.getAttribute('datetime')),
      publishedText: cleanText(timeEl?.text),
      excerpt: cleanText(excerptMeta?.getAttribute('content')),
      imageUrl: normalizeImageUrl(heroImgEl?.getAttribute('src') || heroImgEl?.getAttribute('data-src') || ''),
      imageCaption: cleanText(imageCaptionEl?.text),
      bodyText,
      tags,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
    };

    const needsFallback =
      !article.title ||
      !article.bodyText ||
      !article.imageUrl;

    if (!needsFallback) {
      return article;
    }

    const fallback = await fetchArticleFallbackFromApi(url);
    if (!fallback) {
      return article;
    }

    return {
      ...fallback,
      ...Object.fromEntries(
        Object.entries(article).filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return Boolean(value);
        })
      ),
      tags: article.tags?.length ? article.tags : fallback.tags,
      bodyText: article.bodyText || fallback.bodyText,
      imageUrl: article.imageUrl || fallback.imageUrl,
      imageCaption: article.imageCaption || fallback.imageCaption,
    };
  } catch (err) {
    try {
      const fallback = await fetchArticleFallbackFromApi(url);
      if (fallback?.title) {
        return fallback;
      }
    } catch {
      // Ignore fallback errors and return the original fetch failure below.
    }

    return {
      url,
      error: err.message,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
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
  };
}

module.exports = {
  runScraper,
  scrapeArticleLinks,
  scrapeArticleDetails,
};
