#!/usr/bin/env bash
# Applies selfhost/patch-db.sql to the self-hosted NeoCast database (idempotent),
# then reloads the API schema cache so new tables/functions are visible.
set -euo pipefail
SUPA_DIR="${SUPA_DIR:-/opt/supabase-neocast}"
SQL_FILE="$(cd "$(dirname "$0")" && pwd)/patch-db.sql"

cd "$SUPA_DIR/docker"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$SQL_FILE"
# PostgREST caches the schema; without this reload the app still 404s on new RPCs.
docker compose kill -s SIGUSR1 rest >/dev/null 2>&1 || docker compose restart rest >/dev/null
echo "Database patch applied and API schema reloaded."
