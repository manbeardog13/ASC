#!/usr/bin/env bash
# Load schema.sql plus every migration on a throwaway database, then the pages.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
node --experimental-vm-modules --test tests/*.mjs

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
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/nero-chats.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/slot-occupancy.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -v grant_migration="$PWD/supabase/migrations/20261015141452_harden_table_privileges.sql" -f tests/sql/table-privileges.sql >/dev/null
sudo -u postgres psql -d asc_mig -v ON_ERROR_STOP=1 -f tests/sql/relay-log.sql >/dev/null
sudo -u postgres bash tests/sql/slot-occupancy-race.sh asc_mig
sudo -u postgres bash tests/backup-restore.sh
echo "smoke: schema and migrations applied on throwaway database asc_mig"

node scripts/smoke-pages.mjs
