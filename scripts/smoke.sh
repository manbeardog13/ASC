#!/usr/bin/env bash
# Load schema.sql plus every migration on a throwaway database, then the pages.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
node --experimental-vm-modules --test tests/agent-surface.mjs tests/season-plan.mjs tests/concierge.mjs tests/location-grid.mjs tests/map-pin.mjs tests/first-run.mjs

if ! command -v psql >/dev/null 2>&1; then
  echo "smoke: psql is required to lint migrations" >&2
  exit 1
fi
ver="$(ls /usr/lib/postgresql 2>/dev/null | head -n 1 || true)"
if [[ -n "$ver" ]] && command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster "$ver" main start >/dev/null 2>&1 || true
fi
sudo -u postgres psql -d postgres -c "drop database if exists asc_mig;" >/dev/null
sudo -u postgres psql -d postgres -c "create database asc_mig;" >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/prelude.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f supabase/schema.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/seed.sql >/dev/null
for migration in supabase/migrations/*.sql; do
  sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/exercise.sql >/dev/null
echo "smoke: schema and migrations applied on throwaway database asc_mig"

node scripts/smoke-pages.mjs
