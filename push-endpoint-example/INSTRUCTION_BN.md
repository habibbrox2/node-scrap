# `push-endpoint-example/index.php` তৈরির নির্দেশনা (বাংলা)

এই ফাইলটি Brox Scraper থেকে আসা push payload (articles/mobiles) রিসিভ করার জন্য একটি simple PHP endpoint।

---

## 1) কোথায় ফাইল তৈরি করবেন

হোস্টিংয়ে (cPanel/File Manager/FTP) একটি folder তৈরি করুন:

`public_html/push-endpoint-example/`

এর ভেতরে `index.php` নামে ফাইল তৈরি করুন।

---

## 2) `index.php` ফাইলের কাজ কী হবে

ফাইলটি নিচের কাজগুলো করবে:

1. শুধু `POST` request গ্রহণ করবে  
2. JSON payload parse করবে  
3. payload-এ `articles` নাকি `mobiles` এসেছে বুঝবে  
4. প্রতিটি request log file-এ append করবে  
5. JSON response দেবে (`ok: true/false`)

---

## 3) Authentication (ঐচ্ছিক কিন্তু recommended)

`index.php` এর শুরুতে:

- `$requireAuth = true/false`  
- `$authToken = 'YOUR_SECRET_TOKEN'`

যদি `$requireAuth = true` দেন, তাহলে endpoint এ request করতে `Authorization: Bearer YOUR_SECRET_TOKEN` লাগবে।

---

## 4) Log file path

`index.php` এ log path:

- `push-endpoint-example/logs/push-received.jsonl`

এখানে JSON line format-এ request জমা হবে।

---

## 5) Brox Scraper Dashboard-এ কী সেট করবেন

`Settings` পেজে:

1. `Enable POST delivery after scrape` → ON  
2. `Enable article push` → ON  
3. `Enable mobile push` → ON  
4. `ARTICLES PUSH URL` → `https://your-domain.com/push-endpoint-example/index.php`  
5. `MOBILES PUSH URL` → `https://your-domain.com/push-endpoint-example/index.php`  
6. `PUSH HEADERS (JSON)` (token enabled হলে):

```json
{
  "Authorization": "Bearer YOUR_SECRET_TOKEN"
}
```

---

## 6) Test করার উপায়

### A) Browser/Server check

- `logs/push-received.jsonl` ফাইলে নতুন line আসছে কি না দেখুন।

### B) Scraper side check

- একবার manual scrape run দিন  
- Settings page এর Push Logs-এ success/fail দেখুন

---

## 7) Common error

- `Method not allowed` → GET দিয়ে hit করছেন, POST দিন  
- `Invalid JSON payload` → request body JSON না  
- `Unauthorized` → Bearer token mismatch  
- `Push endpoint not configured` → dashboard settings-এ URL empty

---

## 8) Security tips

- Production এ `$requireAuth = true` রাখুন  
- শক্তিশালী token ব্যবহার করুন  
- HTTPS ছাড়া endpoint expose করবেন না  
- Log file permissions সীমিত রাখুন

