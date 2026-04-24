# প্রথম আলো Scraper

প্রথম আলোর সর্বশেষ নিবন্ধগুলো স্ক্র্যাপ করে local cache-এ সংরক্ষণ করে এবং REST API-এর মাধ্যমে সরবরাহ করে।

## Features

- 🕷️ **Scraper** — prothomalo.com/collection/latest থেকে নিবন্ধ সংগ্রহ করে
- 💾 **Local Cache** — JSON ফাইলে সংরক্ষণ, deduplication সহ (max 500 articles)
- 🔌 **REST API** — Express.js server, filtering ও pagination সহ
- ⏰ **Cron Jobs** — node-cron দিয়ে scheduled scraping (default: every hour)
- 🖥️ **Dashboard** — সুন্দর web UI http://localhost:3000 এ

## Quick Start

```bash
npm install
npm start
```

Server চালু হবে: http://localhost:3000

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/status` | Scraper status + cache stats |
| POST | `/api/scrape` | Manual scrape trigger |
| GET | `/api/articles` | Cached articles (paginated) |
| GET | `/api/articles/search?url=` | Article by URL |
| GET | `/api/stats` | Detailed statistics |
| GET | `/api/cache/export` | Download full cache JSON |
| DELETE | `/api/cache` | Clear all cache |
| POST | `/api/cron` | Manage cron jobs |
| GET | `/api/scrape/log` | Live scrape log |

## Query Parameters (GET /api/articles)

| Param | Description | Example |
|-------|-------------|---------|
| `page` | Page number | `?page=2` |
| `limit` | Per page count | `?limit=50` |
| `category` | Filter by category | `?category=ক্রিকেট` |
| `search` | Search in title/body | `?search=নেতানিয়াহু` |
| `from` | From date (ISO) | `?from=2026-04-01` |
| `to` | To date (ISO) | `?to=2026-04-30` |

## Cron Job Management

```bash
# Start a custom cron job (every 3 hours)
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action":"start","schedule":"0 */3 * * *","name":"every-3h"}'

# Stop a job
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action":"stop","name":"hourly"}'

# List active jobs
curl -X POST http://localhost:3000/api/cron \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```

## File Structure

```
prothomalo-scraper/
├── index.js          # Express server + cron jobs
├── src/
│   ├── scraper.js    # Scraping logic
│   └── cache.js      # Cache read/write/meta
├── cache/
│   ├── articles.json # Cached articles
│   └── meta.json     # Run history & stats
└── public/
    └── index.html    # Dashboard UI
```

## Default Cron Schedule

Default: `0 * * * *` (every hour on the hour)

Change via the dashboard or API.
