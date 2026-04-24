const prothomalo = require('./scraper');
const ittefaq = require('./ittefaq');
const gsmarena_bd = require('./gsmarena_bd');
const dainikshiksha = require('./dainikshiksha');

const SCRAPERS = {
  prothomalo,
  ittefaq,
  gsmarena_bd,
  gsmarena: gsmarena_bd,
  dainikshiksha,
  shiksha: dainikshiksha,
};

const PRIMARY_SOURCES = [
  'prothomalo',
  'ittefaq',
  'gsmarena_bd',
  'dainikshiksha',
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
