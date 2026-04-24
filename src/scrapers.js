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

function getScraper(source) {
  const key = (source || 'prothomalo').toString().trim().toLowerCase();
  return SCRAPERS[key] || SCRAPERS.prothomalo;
}

function listSources() {
  return Object.keys(SCRAPERS);
}

module.exports = {
  getScraper,
  listSources,
};
