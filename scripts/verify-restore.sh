#!/usr/bin/env bash
# ============================================================================
# verify-restore.sh — an untested backup isn't a backup.
# Decrypts the newest DB backup and restores it into a THROWAWAY local Postgres,
# then runs integrity checks. Exits non-zero if anything looks wrong.
#
# Requires env: ENC_KEY (passphrase), TEST_DB_URL (throwaway postgres, e.g. the
# service container). BACKUP_DIR defaults to database_backups/db.
# ============================================================================
set -euo pipefail
: "${ENC_KEY:?ENC_KEY is required}"
: "${TEST_DB_URL:?TEST_DB_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-database_backups/db}"

NEWEST="$(ls -1 "$BACKUP_DIR"/asc-*.sql.gz.enc 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$NEWEST" ]; then echo "::error::No backup found in $BACKUP_DIR"; exit 1; fi
echo "→ Verifying newest backup: $NEWEST"

echo "→ Decrypting + restoring into throwaway database…"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:ENC_KEY -in "$NEWEST" \
  | gunzip \
  | psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q

echo "→ Running integrity checks…"
FAIL=0
for table in customers vehicles storage_sets tires; do
  if ! psql "$TEST_DB_URL" -tAc "select to_regclass('public.$table') is not null" | grep -q t; then
    echo "::error::Table '$table' missing after restore"; FAIL=1
  fi
done

SETS=$(psql "$TEST_DB_URL" -tAc "select count(*) from storage_sets" || echo "ERR")
echo "   storage_sets rows restored: $SETS"
[ "$SETS" = "ERR" ] && FAIL=1

# Referential sanity: no tire should point at a missing set.
ORPHANS=$(psql "$TEST_DB_URL" -tAc "select count(*) from tires t left join storage_sets s on s.id=t.set_id where s.id is null" || echo "ERR")
if [ "$ORPHANS" != "0" ]; then echo "::error::$ORPHANS orphaned tire rows after restore"; FAIL=1; fi

if [ "$FAIL" != "0" ]; then echo "✗ Backup verification FAILED"; exit 1; fi
echo "✓ Backup verified: schema intact, $SETS sets, no orphans."
echo "sets=$SETS" >> "${GITHUB_ENV:-/dev/null}"
