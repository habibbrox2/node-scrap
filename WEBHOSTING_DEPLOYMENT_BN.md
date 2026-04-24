# Web Hosting Deployment Guide (বাংলা)

এই গাইডে দেখানো হলো:
- কিভাবে এই Scraper app web hosting/VPS এ চালাবেন
- কিভাবে PHP push endpoint ব্যবহার করবেন
- কিভাবে `Enable POST delivery after scrape` + `Enable article push` + `Enable mobile push` সেট করবেন

---

## 1) আগে কী লাগবে

- Node.js 18+ (প্রস্তাবিত 20+)
- npm
- PM2 (process manager) — server reboot হলেও app চালু রাখতে
- (ঐচ্ছিক) Nginx/Apache reverse proxy
- Domain/SSL (production এর জন্য)

> নোট: Shared hosting (cPanel only PHP hosting) এ Node app চালানো অনেক সময় সম্ভব নয়। VPS/Cloud server সবচেয়ে নিরাপদ অপশন।

---

## 2) সার্ভারে app deploy

### Step 1: কোড ক্লোন

```bash
git clone https://github.com/habibbrox2/node-scrap.git
cd node-scrap
```

### Step 2: dependency install

```bash
npm install
```

### Step 3: app run (test)

```bash
npm start
```

ডিফল্ট URL: `http://SERVER_IP:9999`

### Step 4: PM2 দিয়ে production run

```bash
npm install -g pm2
pm2 start index.js --name brox-scraper
pm2 save
pm2 startup
```

---

## 3) PHP Push Endpoint setup (নতুন example)

এই repo-তে example endpoint আছে:

- `push-endpoint-example/index.php`

### Step 1: PHP hosting/public_html এ upload

ধরা যাক আপনার endpoint হবে:
- `https://yourdomain.com/push-endpoint/index.php`

তাহলে:
- `push-endpoint-example/index.php` ফাইল upload করুন
- একই folder এ `logs/` auto তৈরি হবে

### Step 2: Authentication (optional কিন্তু recommended)

`index.php` ফাইলে:

- `$requireAuth = true;`
- `$authToken = 'YOUR_SECRET_TOKEN';`

---

## 4) Scraper app থেকে push enable করা

Dashboard -> `Settings` এ গিয়ে:

1. `Enable POST delivery after scrape` = ON  
2. `Enable article push` = ON  
3. `Enable mobile push` = ON  
4. `ARTICLES PUSH URL` = `https://yourdomain.com/push-endpoint/index.php`
5. `MOBILES PUSH URL` = `https://yourdomain.com/push-endpoint/index.php`  
   (অথবা আলাদা endpoint হলে আলাদা URL দিন)
6. `PUSH HEADERS (JSON)` এ token দিলে:

```json
{
  "Authorization": "Bearer YOUR_SECRET_TOKEN"
}
```

তারপর `Save Settings`।

---

## 5) Push কাজ করছে কি না যাচাই

1. Manual scrape run দিন (`Scrape Now`)
2. Dashboard এর Push Logs দেখুন (Settings page)
3. Server side check:
   - `push-endpoint/logs/push-received.jsonl` ফাইলে নতুন entry এসেছে কি না

---

## 6) Cron + Auto push

Cron job active থাকলে (`/api/cron`) scrape শেষে push auto trigger হবে।  
Push success/fail status Push Logs-এ দেখা যাবে।

---

## 7) Security checklist (production)

- Strong Bearer token ব্যবহার করুন
- Endpoint URL public হলেও token ছাড়া request reject করুন
- শুধুমাত্র HTTPS ব্যবহার করুন
- Firewall/security group দিয়ে অপ্রয়োজনীয় port বন্ধ করুন
- নিয়মিত `logs/*.jsonl` rotate/backup করুন

---

## 8) Troubleshooting

- `Push endpoint not configured`:
  - Settings এ URL empty আছে, URL দিন

- `Unauthorized`:
  - Header token mismatch

- `Timeout`:
  - endpoint response slow, hosting performance/timeout check করুন

- `404 on /api/push/logs`:
  - পুরনো server process চলছে, app restart দিন

```bash
pm2 restart brox-scraper
```

