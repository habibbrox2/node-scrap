# Brox Scraper

Brox Scraper is a multi-source scraping dashboard that collects content, stores it in a local JSON cache, and exposes it via a REST API. It also supports scheduled scraping via cron jobs.

Default dashboard: `http://localhost:9999/`

## Key Features

- Web dashboard to trigger scrapes and view live logs
- Source selector with default `All` (runs all supported sources sequentially)
- Local cache (articles + mobiles) with deduplication
- REST API with pagination and search
- Cron jobs (hourly by default) via `node-cron`
- Optional push to an external endpoint after scraping

## Supported Sources

The exact list can be viewed from the dashboard dropdown or via `GET /api/status`.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:9999/`.

## Configuration (Environment Variables)

- `PORT` (default: `9999`)
- `SCRAPER_SOURCE` (default: `prothomalo`) — used only when API callers omit `source`
- `SCRAPER_CRON_SCHEDULE` (default: `0 * * * *`)
- `PUSH_ENDPOINT_URL` — enable push after scraping
- `PUSH_ENDPOINT_HEADERS_JSON` — extra headers as JSON, e.g. `{"Authorization":"Bearer ..."}`
- `PUSH_ENDPOINT_TIMEOUT_MS` (default: `30000`)

You can also configure the push endpoint from the dashboard (API Settings) or via `POST /api/settings`.

## API

### Core Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/status` | Status + cache stats + sources |
| POST | `/api/scrape` | Start a scrape run |
| GET | `/api/scrape/log` | Live scrape log |
| GET | `/api/articles` | Cached articles (paginated) |
| GET | `/api/articles/search?url=` | Article by URL |
| GET | `/api/mobiles` | Cached mobiles (paginated) |
| GET | `/api/stats` | Statistics |
| GET | `/api/cache/export` | Export article cache JSON |
| GET | `/api/mobiles/export` | Export mobile cache JSON |
| DELETE | `/api/cache` | Clear caches |
| GET | `/api/settings` | Get API settings (push endpoint + headers) |
| POST | `/api/settings` | Update API settings (push endpoint + headers) |
| POST | `/api/cron` | Start/stop/list cron jobs |

### Trigger Scrape (Examples)

Run all sources:

```bash
curl -X POST http://localhost:9999/api/scrape \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"all\"}"
```

Run a single source:

```bash
curl -X POST http://localhost:9999/api/scrape \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"gsmarena_bd\"}"
```

## Push Delivery (POST)

When a push endpoint is configured, newly-added items are POSTed after a scrape run with payload:

```json
{
  "source": "all",
  "trigger": "manual",
  "pushedAt": "2026-04-25T00:00:00.000Z",
  "count": 10,
  "articles": []
}
```

## Cron Jobs (Examples)

```bash
curl -X POST http://localhost:9999/api/cron \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"start\",\"schedule\":\"0 */3 * * *\",\"name\":\"every-3h\",\"source\":\"all\"}"
```

## Database

After each scrape run, scraped items are also stored in a local SQLite DB file:

- `cache/brox.sqlite` (tables: `content_items`, `scrape_runs`)

## Project Structure

```
brox-scraper/
├── index.js              # Express API + scrape orchestration + cron
├── src/                  # Individual scrapers + cache helpers
├── cache/                # Local JSON caches
└── public/               # Dashboard UI
```
