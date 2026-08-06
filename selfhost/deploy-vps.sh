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

echo "==> 3/5 Installing deps + build"
command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"; }
export PATH="$HOME/.bun/bin:$PATH"
bun install
rm -rf "$APP_DIR/.output"
bun run build
if [ ! -f "$APP_DIR/.output/public/favicon.svg" ]; then
  mkdir -p "$APP_DIR/.output/public"
  cp -f "$APP_DIR/public/favicon.svg" "$APP_DIR/.output/public/favicon.svg"
fi

echo "==> 4/5 Restarting PM2 app ($PM2_NAME on port $APP_PORT)"
command -v pm2 >/dev/null || npm i -g pm2
# Load .env into this shell so pm2 --update-env hands the vars to the app.
set -a; . "$APP_DIR/.env"; set +a
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start "bun run start" --name "$PM2_NAME" --cwd "$APP_DIR"
fi
pm2 save

# Fail loudly if nginx is still serving a stale process/deployment.
for _ in $(seq 1 20); do
  LIVE_HTML=$(curl -fsS https://neocast.cc/crzr-x9k2-panel || true)
  if printf '%s' "$LIVE_HTML" | grep -q '/assets/'; then break; fi
  sleep 1
done
if ! printf '%s' "${LIVE_HTML:-}" | grep -q '/assets/'; then
  echo "!! App did not become ready through nginx"
  exit 1
fi

echo "==> 5/5 Status"
pm2 logs "$PM2_NAME" --lines 25 --nostream || true
echo
echo "Done. App: https://neocast.cc  (local: http://127.0.0.1:$APP_PORT)"
