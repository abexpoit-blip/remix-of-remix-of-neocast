#!/usr/bin/env bash
# Adds the 'superadmin' role to the self-hosted database (idempotent).
set -euo pipefail
SUPA_DIR="${SUPA_DIR:-/opt/supabase-neocast}"
SQL_FILE="$(cd "$(dirname "$0")" && pwd)/fix-superadmin.sql"

cd "$SUPA_DIR/docker"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$SQL_FILE"
docker compose restart rest >/dev/null
echo "superadmin role installed; API schema reloaded."
