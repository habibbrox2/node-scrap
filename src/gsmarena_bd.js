const { parse } = require('node-html-parser');
const { curlGet } = require('./curl');

const BASE_URL = 'https://www.gsmarena.com.bd';
const LISTING_URL = `${BASE_URL}/`;
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

function getLatestDevicesArea(root) {
  const areas = root.querySelectorAll('div.col-md-9 .area');
  for (const area of areas) {
    const titleEl = area.querySelector('h1.title, h2.title, h3.title');
    const title = cleanText(titleEl?.text);
    if (/latest\s+update\s+devices/i.test(title)) return area;
  }
  return null;
}

function parseMobileCard(card) {
  const linkEl = card.querySelector('.product-thumb > a[href]') || card.querySelector('a.vdetails[href]');
  const imgEl = card.querySelector('.product-thumb img[src]');
  const nameEl = card.querySelector('.product-thumb .mobile_name');
  const priceEl = card.querySelector('.product-thumb .mobile_price');
  const statusEl = card.querySelector('.product-thumb .mobile_price .dstatus');

  const url = normalizeUrl(linkEl?.getAttribute('href'));
  if (!url) return null;

  const title = cleanText(nameEl?.text || linkEl?.getAttribute('title'));
  const imageUrl = normalizeImageUrl(imgEl?.getAttribute('src') || '');

  const status = cleanText(statusEl?.text);
  const priceText = cleanText(priceEl?.text || '')
    .replace(status, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url,
    title,
    imageUrl,
    priceText,
    status,
  };
}

async function scrapeMobileLinks() {
  const root = await fetchPage(LISTING_URL);
  const area = getLatestDevicesArea(root) || root.querySelector('div.col-md-9') || root;
  const cards = area.querySelectorAll('.product-thumb').map(thumb => thumb.closest('.col-xs-6, .col-sm-4, .col-md-3') || thumb);

  const links = [];
  const seen = new Set();

  cards.forEach(card => {
    const item = parseMobileCard(card);
    if (!item) return;
    if (seen.has(item.url)) return;
    seen.add(item.url);
    links.push(item.url);
  });

  return links.slice(0, LISTING_LIMIT);
}

function upsertSpecValue(target, key, value) {
  if (!key) return;
  if (value === undefined || value === null) return;
  const cleanValue = cleanText(value);
  if (!cleanValue) return;

  const existing = target[key];
  if (!existing) {
    target[key] = cleanValue;
    return;
  }

  if (Array.isArray(existing)) {
    if (!existing.includes(cleanValue)) existing.push(cleanValue);
    return;
  }

  if (existing === cleanValue) return;
  target[key] = [existing, cleanValue];
}

function parseSpecsTables(root) {
  const specs = {};
  const tables = root.querySelectorAll('table.table_specs');
  tables.forEach(table => {
    table.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;
      const key = cleanText(cells[0].text);
      const value = cleanText(cells[1].text);
      if (!key || !value) return;
      upsertSpecValue(specs, key, value);
    });
  });
  return specs;
}

function parseKeySpecs(root) {
  const keySpecs = {};
  root.querySelectorAll('.keyinfo').forEach(node => {
    const key = cleanText(node.querySelector('.keyname')?.text);
    const value = cleanText(node.querySelector('.keyspec')?.text);
    if (!key || !value) return;
    upsertSpecValue(keySpecs, key, value);
  });
  return keySpecs;
}

async function scrapeMobileDetails(url) {
  try {
    const root = await fetchPage(url);
    const main = root.querySelector('div.col-md-9') || root;

    const canonicalEl = root.querySelector('link[rel=\"canonical\"]');
    const canonicalUrl = normalizeUrl(canonicalEl?.getAttribute('href') || url) || url;

    const titleEl = main.querySelector('h1.ptitle') || main.querySelector('h1');
    const statusEl =
      main.querySelector('.pnupcoming') ||
      main.querySelector('.pnofficial') ||
      main.querySelector('.pnrumored') ||
      main.querySelector('.pnavailable') ||
      main.querySelector('.pncoming');

    const heroImgEl =
      main.querySelector('a[href*=\"/pictures/\"] img[src]') ||
      main.querySelector('img.img-responsive[src]');

    const specs = parseSpecsTables(main);
    const keySpecs = parseKeySpecs(main);

    const brand = cleanText(specs.Brand);
    const category = cleanText(specs.Category);
    const price = cleanText(specs.Price);
    const model = cleanText(specs.Model);

    const title = cleanText(titleEl?.text);
    const status = cleanText(statusEl?.text);
    const imageUrl = normalizeImageUrl(heroImgEl?.getAttribute('src') || '');

    const bodyLines = [];
    Object.entries({ ...keySpecs, ...specs }).forEach(([k, v]) => {
      if (!v) return;
      if (Array.isArray(v)) {
        bodyLines.push(`${k}: ${v.join(' | ')}`);
      } else {
        bodyLines.push(`${k}: ${v}`);
      }
    });

    const tags = [...new Set([brand, category].filter(Boolean))];
    const excerptParts = [price || '', status || ''].filter(Boolean);

    return {
      url: canonicalUrl,
      title,
      category: category || brand,
      author: '',
      publishedAt: '',
      publishedText: '',
      excerpt: excerptParts.join(' - '),
      imageUrl,
      imageCaption: '',
      bodyText: bodyLines.join('\n'),
      tags,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'gsmarena_bd',
      contentType: 'mobile',
      price,
      status,
      brand,
      model,
      productCategory: category,
      keySpecs,
      specs,
    };
  } catch (err) {
    return {
      url,
      error: err.message,
      scrapedAt: new Date().toISOString(),
      fetchMethod: 'curl',
      source: 'gsmarena_bd',
      contentType: 'mobile',
    };
  }
}

async function runScraper(onProgress) {
  const results = [];
  const errors = [];

  onProgress?.({ stage: 'listing', message: 'Fetching mobile listing with curl...' });
  const links = await scrapeMobileLinks();
  onProgress?.({ stage: 'listing', message: `Found ${links.length} mobiles`, count: links.length });

  for (let index = 0; index < links.length; index += 1) {
    const url = links[index];
    onProgress?.({
      stage: 'mobile',
      message: `Scraping mobile ${index + 1}/${links.length}`,
      url,
      index,
    });

    const item = await scrapeMobileDetails(url);
    if (item.error || !item.title || !item.imageUrl) {
      errors.push(item);
    } else {
      results.push(item);
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
    scraperSource: 'gsmarena_bd',
  };
}

module.exports = {
  runScraper,
  scrapeMobileLinks,
  scrapeMobileDetails,
};

