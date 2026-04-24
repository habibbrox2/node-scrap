const prothomalo = require('./scraper');
const ittefaq = require('./ittefaq');
const gsmarena_bd = require('./gsmarena_bd');
const dainikshiksha = require('./dainikshiksha');
const bdnews24 = require('./bdnews24');

const SCRAPERS = {
  prothomalo,
  ittefaq,
  gsmarena_bd,
  gsmarena: gsmarena_bd,
  dainikshiksha,
  shiksha: dainikshiksha,
  bdnews24,
  bdnews24_special: bdnews24,
};

const PRIMARY_SOURCES = [
  'prothomalo',
  'ittefaq',
  'gsmarena_bd',
  'dainikshiksha',
  'bdnews24',
];

function getScraper(source) {
  const key = (source || 'prothomalo').toString().trim().toLowerCase();
  return SCRAPERS[key] || SCRAPERS.prothomalo;
}

function listSources(options = {}) {
  if (options && options.includeAliases) {
    return Object.keys(SCRAPERS);
  }

  return PRIMARY_SOURCES.slice();
}

module.exports = {
  getScraper,
  listSources,
};
