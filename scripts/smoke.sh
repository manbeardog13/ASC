#!/usr/bin/env bash
# Lint the location migrations on a throwaway database and load the main pages.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
node --experimental-vm-modules --test tests/agent-surface.mjs tests/season-plan.mjs tests/concierge.mjs tests/location-grid.mjs tests/map-pin.mjs

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
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/harness.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f supabase/migrations/20261014223000_locations_and_movements.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f supabase/migrations/20261014223100_revoke_asc_audit_and_fix_set_updated_at.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f supabase/migrations/20261014230000_keep_plan_and_swap.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/exercise.sql >/dev/null
echo "smoke: migrations applied on throwaway database asc_mig"

node scripts/smoke-pages.mjs
