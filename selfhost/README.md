# NeoCast — Self-hosted Supabase (VPS: 157.173.117.34)

সব ডাটা এখন থেকে **তোমার নিজের VPS**-এ থাকবে। Supabase cloud আর লাগবে না।

---

## ধাপ ০ — DNS
Domain panel-এ একটা A record বানাও:

| Type | Name | Value |
|---|---|---|
| A | `api` | `157.173.117.34` |

অর্থাৎ `supabase.neocast.cc` → তোমার VPS. (৫–১০ মিনিট অপেক্ষা করো)

---

## ধাপ ১ — কোড টেনে নাও (VPS-এ)
```bash
cd /var/www/neocast-cc && git fetch origin && git reset --hard origin/main
```

## ধাপ ২ — ইনস্টলার চালাও
```bash
cd /var/www/neocast-cc/selfhost && chmod +x setup-supabase.sh && bash setup-supabase.sh
```
এটা করবে: Docker ইনস্টল → Supabase stack চালু → key generate → schema apply → `supabase.neocast.cc` nginx + SSL → অ্যাপের `.env` লিখে দেবে।

শেষে স্ক্রিনে **সব details** প্রিন্ট হবে — কপি করে সেভ করে রাখো।
পরেও দেখা যাবে:
```bash
cat /opt/supabase/credentials.json
```

### যদি `supabase-db is unhealthy` আসে
প্রথম ইনস্টল মাঝপথে `Ctrl+C` করলে DB init partial/corrupt হতে পারে। যেহেতু তখনো live data নেই, একবার clean reset দিয়ে আবার চালাও:

```bash
cd /opt/supabase/docker && docker compose down -v --remove-orphans && rm -rf volumes/db/data
cd /var/www/neocast-cc/selfhost && bash setup-supabase.sh
```

> Warning: live data থাকলে এই reset চালাবে না — আগে backup নিতে হবে।

## ধাপ ৩ — অ্যাডমিন ইউজার তৈরি বা repair করো
```bash
cd /var/www/neocast-cc/selfhost
SUPABASE_URL=https://supabase.neocast.cc \
SERVICE_KEY=$(jq -r .SERVICE_ROLE_KEY /opt/supabase-neocast/credentials.json) \
node create-users.mjs '<email>' '<password>' superadmin
```
একই email আগে থাকলে এই command password reset, email confirmation এবং প্রয়োজনীয়
`admin` + `superadmin` role repair করে শেষে real password login verify করবে।

## ধাপ ৪ — অ্যাপ রিবিল্ড (নতুন DB-তে পয়েন্ট করার জন্য)
```bash
cd /var/www/neocast-cc && bun install && bun run build && pm2 restart neocast-cc --update-env
pm2 logs neocast-cc --lines 30 --nostream
```

---

## যেসব details তুমি পাবে (সেভ করে রাখার জন্য)

| নাম | কোথায় | কাজ |
|---|---|---|
| **API URL** | `https://supabase.neocast.cc` | অ্যাপ এখানে কানেক্ট হবে |
| **ANON_KEY** | credentials.json | ফ্রন্টএন্ড পাবলিক key |
| **SERVICE_ROLE_KEY** | credentials.json | সার্ভার/অ্যাডমিন key — কখনো ফ্রন্টে দিও না |
| **JWT_SECRET** | credentials.json | টোকেন সাইনিং |
| **POSTGRES_PASSWORD** | credentials.json | DB পাসওয়ার্ড |
| **Studio UI** | `http://127.0.0.1:8001` (SSH tunnel) | DB dashboard (username/password credentials.json-এ) |
| **DB connection** | `postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5433/postgres` | psql / backup |

> ⚠️ NeoCast আর Zoru সম্পূর্ণ আলাদা ইনস্ট্যান্স — কখনো মেশানো যাবে না।
>
> | | NeoCast | Zoru |
> |---|---|---|
> | Supabase dir | `/opt/supabase-neocast` | `/opt/supabase` (Zoru-র নিজের) |
> | Kong/API port | `8001` | `8000` |
> | Postgres port | `5433` | `5432` |
> | App port (PM2) | `3003` (`neocast-cc`) | `3002` (`zoru-cc`) |
> | Domain | `neocast.cc`, `supabase.neocast.cc` | `zoru.cc` |
>
> কী (ANON/SERVICE_ROLE/JWT/DB পাসওয়ার্ড)ও আলাদা — এক প্রজেক্টের key আরেকটায় বসিও না।

---

## দরকারি কমান্ড (শুধু NeoCast)
```bash
cd /opt/supabase-neocast/docker
docker compose ps                 # status
docker compose logs -f auth       # auth log
docker compose restart            # restart সব
docker compose down && docker compose up -d
```

### ব্যাকআপ (প্রতিদিন চালানো ভালো)
```bash
cd /opt/supabase-neocast/docker
docker compose exec -T db pg_dump -U postgres postgres | gzip > /root/neocast-db-$(date +%F).sql.gz
```

### পুরনো cloud ডাটা আনতে চাইলে
Lovable Cloud → Advanced settings → Export data দিয়ে CSV নামাও, তারপর Studio-র Table editor → Import CSV.

---

## সিকিউরিটি
```bash
ufw allow 22,80,443/tcp
ufw deny 5433/tcp     # NeoCast DB বাইরে থেকে বন্ধ
ufw deny 8001/tcp     # NeoCast Studio শুধু SSH tunnel দিয়ে
ufw enable
```
Studio নিরাপদভাবে দেখতে লোকাল পিসি থেকে:
```bash
ssh -L 8001:127.0.0.1:8001 root@157.173.117.34
# তারপর ব্রাউজারে http://localhost:8001
```

