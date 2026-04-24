# `push-endpoint-example/index.php` তৈরির নির্দেশনা (বাংলা)

এই ফাইলটি Brox Scraper থেকে আসা push payload (articles/mobiles) রিসিভ করার জন্য একটি PHP endpoint।

এই version-এ `mysqli` support দেওয়া আছে, তাই shared hosting/cPanel পরিবেশে MySQL database এ log রাখতে পারবেন।

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
4. `mysqli` configured থাকলে database table (`push_logs`) এ log save করবে  
5. database unavailable হলে `logs/push-received.jsonl` এ fallback log লিখবে  
6. JSON response দেবে (`ok: true/false`)

---

## 3) Authentication (ঐচ্ছিক কিন্তু recommended)

`index.php` এর শুরুতে:

- `$requireAuth = true/false`  
- `$authToken = 'YOUR_SECRET_TOKEN'`

যদি `$requireAuth = true` দেন, তাহলে endpoint এ request করতে `Authorization: Bearer YOUR_SECRET_TOKEN` লাগবে।

---

## 4) mysqli / MySQL সেটআপ (প্রয়োজনীয়)

`index.php` এর শুরুতে:

- `$useMysqli = true;`
- `$dbHost`, `$dbUser`, `$dbPass`, `$dbName`, `$dbPort` আপনার hosting database অনুযায়ী দিন

### cPanel/phpMyAdmin এ table তৈরি

Option A (recommended):
- `push-endpoint-example/push_logs.sql` import করুন

Option B:
- endpoint প্রথমবার hit হলে `push_logs` table auto create করার চেষ্টা করবে

---

## 5) Log file path (fallback)

`index.php` এ log path:

- `push-endpoint-example/logs/push-received.jsonl`

MySQL কাজ না করলে এখানে JSON line format-এ request জমা হবে।

---

## 6) Brox Scraper Dashboard-এ কী সেট করবেন

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

## 7) Test করার উপায়

### A) Browser/Server check

- MySQL table `push_logs` এ নতুন row আসছে কি না দেখুন।
- fallback হলে `logs/push-received.jsonl` ফাইলে line আসবে।

### B) Scraper side check

- একবার manual scrape run দিন  
- Settings page এর Push Logs-এ success/fail দেখুন

---

## 8) Common error

- `Method not allowed` → GET দিয়ে hit করছেন, POST দিন  
- `Invalid JSON payload` → request body JSON না  
- `Unauthorized` → Bearer token mismatch  
- `Push endpoint not configured` → dashboard settings-এ URL empty

---

## 9) Security tips

- Production এ `$requireAuth = true` রাখুন  
- শক্তিশালী token ব্যবহার করুন  
- HTTPS ছাড়া endpoint expose করবেন না  
- Log file permissions সীমিত রাখুন
