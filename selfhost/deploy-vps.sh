#!/usr/bin/env bash
# NeoCast — VPS deploy / update script
# Run on the VPS as root:  bash deploy-vps.sh
set -euo pipefail

REPO="${REPO:-https://github.com/shovonex4-lgtm/remix-of-remix-of-neocast}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/neocast-cc}"
PM2_NAME="${PM2_NAME:-neocast-cc}"
APP_PORT="${APP_PORT:-3003}"
CREDS="${CREDS:-/opt/supabase-neocast/credentials.json}"
DOMAIN_API="${DOMAIN_API:-supabase.neocast.cc}"

echo "==> 1/5 Fetching code from $REPO ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git remote set-url origin "$REPO"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> 2/5 Writing .env (self-hosted Supabase)"
if [ ! -s "$CREDS" ]; then
  echo "!! $CREDS not found — run selfhost/setup-supabase.sh first"; exit 1
fi
command -v jq >/dev/null || apt-get install -y jq
ANON_KEY=$(jq -r .ANON_KEY "$CREDS")
SERVICE_ROLE_KEY=$(jq -r .SERVICE_ROLE_KEY "$CREDS")
POSTGRES_PASSWORD=$(jq -r .POSTGRES_PASSWORD "$CREDS")

# Keep app-specific secrets across deployments. The generated backend values
# below are refreshed, but unrelated secrets must not be erased.
PLISIO_API_KEY="${PLISIO_API_KEY:-}"
if [ -z "$PLISIO_API_KEY" ] && [ -f "$APP_DIR/.env" ]; then
  PLISIO_API_KEY=$(sed -n 's/^PLISIO_API_KEY=//p' "$APP_DIR/.env" | tail -n 1)
fi

cat > "$APP_DIR/.env" <<APPENV
VITE_SUPABASE_URL=https://$DOMAIN_API
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_URL=https://$DOMAIN_API
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_DB_URL=postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5433/postgres
PORT=$APP_PORT
APPENV
if [ -n "$PLISIO_API_KEY" ]; then
  printf 'PLISIO_API_KEY=%s\n' "$PLISIO_API_KEY" >> "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"

echo "    Checking NeoCast auth gateway"
AUTH_STATUS=$(curl -sS -o /tmp/neocast-auth-health.json -w '%{http_code}' \
  -H "apikey: $ANON_KEY" "https://$DOMAIN_API/auth/v1/health" || true)
if [ "$AUTH_STATUS" != "200" ]; then
  echo "!! Auth gateway failed (HTTP $AUTH_STATUS)"
  cat /tmp/neocast-auth-health.json 2>/dev/null || true
  exit 1
fi

echo "    Applying database patch (card columns, redeem codes, deposits)"
bash "$APP_DIR/selfhost/patch-db.sh"

if ! grep -q '^PLISIO_API_KEY=' "$APP_DIR/.env"; then
  echo "!! PLISIO_API_KEY missing from $APP_DIR/.env — crypto deposits will fail."
  echo "   Add it with:  printf 'PLISIO_API_KEY=YOUR_KEY\\n' >> $APP_DIR/.env"
fi
if grep -q '^PLISIO_API_KEY=$' "$APP_DIR/.env"; then
  echo "!! PLISIO_API_KEY is empty in $APP_DIR/.env — crypto deposits will fail."
  exit 1
fi

echo "==> 3/5 Installing deps + build"

command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"; }
export PATH="$HOME/.bun/bin:$PATH"
bun install

# Keep previously built asset chunks so browsers/CDNs still holding the old
# HTML don't hit 500 ENOENT on hashed files that this build replaced.
ASSET_CACHE="$APP_DIR/.asset-cache"
mkdir -p "$ASSET_CACHE"
if [ -d "$APP_DIR/.output/public/assets" ]; then
  cp -an "$APP_DIR/.output/public/assets/." "$ASSET_CACHE/" 2>/dev/null || true
fi

rm -rf "$APP_DIR/.output"
bun run build
if [ ! -f "$APP_DIR/.output/public/favicon.svg" ]; then
  mkdir -p "$APP_DIR/.output/public"
  cp -f "$APP_DIR/public/favicon.svg" "$APP_DIR/.output/public/favicon.svg"
fi
mkdir -p "$APP_DIR/.output/public/assets"
cp -an "$APP_DIR/.output/public/assets/." "$ASSET_CACHE/" 2>/dev/null || true
cp -an "$ASSET_CACHE/." "$APP_DIR/.output/public/assets/" 2>/dev/null || true
# Trim the cache so it can't grow forever (keep newest 800 files).
if [ "$(ls -1 "$ASSET_CACHE" | wc -l)" -gt 800 ]; then
  ls -1t "$ASSET_CACHE" | tail -n +801 | while IFS= read -r f; do rm -f "$ASSET_CACHE/$f"; done
fi

echo "==> 4/5 Restarting PM2 app ($PM2_NAME on port $APP_PORT)"
command -v pm2 >/dev/null || npm i -g pm2
# Load .env into this shell too; the start script also reads it via node --env-file.
set -a; . "$APP_DIR/.env"; set +a
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start "bun run start" --name "$PM2_NAME" --cwd "$APP_DIR" --update-env
pm2 flush "$PM2_NAME" >/dev/null 2>&1 || true
pm2 save

# Fail loudly if the app isn't answering through nginx.
for _ in $(seq 1 20); do
  LIVE_HTML=$(curl -fsS https://neocast.cc/crzr-x9k2-panel | tr -d '\0' || true)
  if printf '%s' "$LIVE_HTML" | grep -q '/assets/'; then break; fi
  sleep 1
done
if ! printf '%s' "${LIVE_HTML:-}" | grep -q '/assets/'; then
  echo "!! App did not become ready through nginx"
  exit 1
fi

echo "    Verifying Supabase config"
if ! grep -q '^SUPABASE_URL=https' "$APP_DIR/.env"; then
  echo "!! SUPABASE_URL missing from $APP_DIR/.env"
  exit 1
fi
# The real signal: does the running app still complain about missing env?
sleep 2
curl -fsS -o /dev/null "http://127.0.0.1:$APP_PORT/crzr-x9k2-panel" || true
if pm2 logs "$PM2_NAME" --lines 60 --nostream 2>/dev/null | grep -q 'Missing Supabase environment'; then
  echo "!! App still reports missing Supabase env — check $APP_DIR/.env and 'bun run start'"
  exit 1
fi
echo "    Supabase env OK"
if grep -q '^PLISIO_API_KEY=.' "$APP_DIR/.env"; then
  echo "    Payment gateway env OK"
fi



echo "==> 5/5 Status"
pm2 logs "$PM2_NAME" --lines 25 --nostream || true
echo
echo "Done. App: https://neocast.cc  (local: http://127.0.0.1:$APP_PORT)"
