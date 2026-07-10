#!/usr/bin/env bash
# ============================================================================
# restore-drill.sh — a REAL recovery test, run after every nightly backup.
#
# "An untested backup isn't a backup" — so instead of just decrypting and
# grepping the dump text (the old weekly check), this actually RESTORES the
# newest encrypted dump into a throwaway Postgres and asserts it recovers.
#
# The recovery mirrors the documented procedure (docs/DISASTER_RECOVERY.md):
# structure first, then data. Structure is pulled from the LIVE database at run
# time (so it can never drift from production), loaded tolerantly (Supabase-only
# policies/triggers that reference auth.* are allowed to fail — we only need the
# tables + foreign keys), and the data-only dump is then restored strictly.
#
# CHECKPOINTS (all must pass; these are the ones that matter for "can we recover"):
#   1. FRESHNESS      — the newest backup is from within the last 26h (pipeline alive)
#   2. DECRYPT        — the AES key works and the gzip isn't corrupt/truncated
#   3. RESTORE-CLEAN  — the data-only dump loads into a real Postgres with ZERO errors
#   4. NON-EMPTY      — customers / vehicles / storage_sets / tires all have rows
#                       (when the live DB has them) — catches empty/partial dumps
#   5. REFERENTIAL    — no orphan vehicles / sets / tires after restore (FKs resolve)
#   6. COMPLETENESS   — restored storage_sets count is within tolerance of live
#                       (catches a dump that silently captured only part of the data)
#   7. ROUND-TRIP     — the newest set restores with the SAME tire-row count as live
#                       (row-level fidelity, not just totals)
#
# Requires env:
#   ENC_KEY   — AES passphrase (BACKUP_ENCRYPTION_KEY)
#   DB_URL    — LIVE Supabase connection (structure + count comparison)
#   SCRATCH   — throwaway Postgres to restore INTO (the CI service container)
# Optional:
#   BACKUP_DIR      — dir of asc-*.sql.gz.enc  (default database_backups/db)
#   MAX_AGE_HOURS   — freshness bound          (default 26)
#   COUNT_TOLERANCE — allowed live/restored storage_sets drift (default 10)
#
# Exit 0 = every checkpoint passed. Non-zero = at least one failed.
# ============================================================================
set -uo pipefail          # deliberately NOT -e: run every checkpoint, collect failures
: "${ENC_KEY:?ENC_KEY is required}"
: "${DB_URL:?DB_URL is required}"
: "${SCRATCH:?SCRATCH is required}"
BACKUP_DIR="${BACKUP_DIR:-database_backups/db}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
COUNT_TOLERANCE="${COUNT_TOLERANCE:-10}"

fail=0
note() { echo "   $*"; }
bad()  { echo "::error::$*"; fail=1; }

# ---- pick the newest dump --------------------------------------------------
NEWEST="$(ls -1 "$BACKUP_DIR"/asc-*.sql.gz.enc 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$NEWEST" ]; then echo "::error::No backup found in $BACKUP_DIR"; exit 1; fi
BASE="$(basename "$NEWEST")"
echo "→ Recovery drill on: $NEWEST"
echo "drill_dump=$BASE" >> "${GITHUB_ENV:-/dev/null}"

# ---- CHECKPOINT 1: freshness ------------------------------------------------
D="${BASE#asc-}"; D="${D%.sql.gz.enc}"     # YYYY-MM-DD
if EPOCH_D=$(date -u -d "$D 00:00:00" +%s 2>/dev/null); then
  AGE_H=$(( ( $(date -u +%s) - EPOCH_D ) / 3600 ))
  if [ "$AGE_H" -gt "$MAX_AGE_HOURS" ]; then
    bad "freshness: newest backup is ${AGE_H}h old (> ${MAX_AGE_HOURS}h) — the backup pipeline has stalled"
  else
    note "✓ freshness: $D (${AGE_H}h old)"
  fi
else
  bad "freshness: could not parse date from '$BASE'"
fi

# ---- CHECKPOINT 2: decrypt + decompress ------------------------------------
PLAIN="$(mktemp)"
trap 'rm -f "$PLAIN"' EXIT
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:ENC_KEY -in "$NEWEST" 2>/dev/null | gunzip > "$PLAIN" 2>/dev/null; then
  BYTES=$(wc -c < "$PLAIN")
  note "✓ decrypt+decompress: $BYTES bytes"
  if [ "$BYTES" -lt 200 ]; then bad "decrypt: dump implausibly small ($BYTES bytes)"; fi
else
  echo "::error::decrypt: wrong BACKUP_ENCRYPTION_KEY or corrupt backup — cannot recover this file"
  echo "✗✗ RECOVERY DRILL ABORTED at decrypt."
  exit 1
fi

# ---- build the recovery target (structure from LIVE, tolerant load) --------
echo "→ Preparing scratch database structure (from live schema)…"
psql "$SCRATCH" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create sequence if not exists set_code_seq;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
SQL
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges \
  -t public.customers -t public.vehicles -t public.storage_sets \
  -t public.tires -t public.photos -t public.audit_events > /tmp/structure.sql 2>/tmp/structure.err || {
    bad "structure: could not read live schema (pg_dump failed)"; cat /tmp/structure.err; }
# Load tolerantly: RLS policies / triggers that reference Supabase-only
# functions (auth.uid, asc_role, asc_audit) will error and are skipped on
# purpose — the CREATE TABLE / FK / index / sequence statements still apply.
psql "$SCRATCH" -q -f /tmp/structure.sql >/tmp/structure.log 2>&1 || true
for t in customers vehicles storage_sets tires; do
  got=$(psql "$SCRATCH" -tAc "select to_regclass('public.$t')" 2>/dev/null)
  if [ "$got" != "$t" ]; then bad "structure: table '$t' failed to create in scratch"; fi
done

# ---- CHECKPOINT 3: strict data restore -------------------------------------
# pg_dump on newer servers emits session GUCs the scratch image may not know
# (e.g. transaction_timeout, added in PG17). They're harmless dump-session
# settings, not data — strip them so a minor server/scratch skew can't abort the
# whole restore and raise a false alarm.
sed -i -E '/^SET (transaction_timeout|idle_session_timeout) /d' "$PLAIN"
echo "→ Restoring the decrypted data-only dump…"
if psql "$SCRATCH" -v ON_ERROR_STOP=1 -q -f "$PLAIN" >/tmp/restore.log 2>&1; then
  note "✓ data restored into scratch with no errors"
else
  bad "restore: data-only dump FAILED to load cleanly"
  echo "---- last lines of restore log ----"; tail -n 8 /tmp/restore.log
fi

# ---- CHECKPOINT 4: core tables non-empty (vs live) -------------------------
declare -A LIVE REST
for t in customers vehicles storage_sets tires; do
  LIVE[$t]=$(psql "$DB_URL"  -tAc "select count(*) from public.$t" 2>/dev/null || echo -1)
  REST[$t]=$(psql "$SCRATCH" -tAc "select count(*) from public.$t" 2>/dev/null || echo -1)
  note "table $t: live=${LIVE[$t]} restored=${REST[$t]}"
  if [ "${LIVE[$t]}" -gt 0 ] && [ "${REST[$t]}" -le 0 ]; then
    bad "non-empty: '$t' is empty in the restore but live has ${LIVE[$t]} rows"
  fi
done

# ---- CHECKPOINT 5: referential integrity in the restored data --------------
ORPH_V=$(psql "$SCRATCH" -tAc "select count(*) from vehicles v left join customers c on c.id=v.customer_id where v.customer_id is not null and c.id is null" 2>/dev/null || echo -1)
ORPH_S=$(psql "$SCRATCH" -tAc "select count(*) from storage_sets s left join vehicles v on v.id=s.vehicle_id where s.vehicle_id is not null and v.id is null" 2>/dev/null || echo -1)
ORPH_T=$(psql "$SCRATCH" -tAc "select count(*) from tires t left join storage_sets s on s.id=t.set_id where s.id is null" 2>/dev/null || echo -1)
if [ "$ORPH_V" = 0 ] && [ "$ORPH_S" = 0 ] && [ "$ORPH_T" = 0 ]; then
  note "✓ referential integrity intact (0 orphan vehicles / sets / tires)"
else
  bad "referential: orphans after restore — vehicles=$ORPH_V sets=$ORPH_S tires=$ORPH_T"
fi

# ---- CHECKPOINT 6: completeness vs live (tolerant) -------------------------
if [ "${LIVE[storage_sets]}" -ge 0 ] && [ "${REST[storage_sets]}" -ge 0 ]; then
  DIFF=$(( LIVE[storage_sets] - REST[storage_sets] ))
  [ "$DIFF" -lt 0 ] && DIFF=$(( -DIFF ))
  if [ "$DIFF" -gt "$COUNT_TOLERANCE" ]; then
    bad "completeness: storage_sets live=${LIVE[storage_sets]} restored=${REST[storage_sets]} differ by $DIFF (> $COUNT_TOLERANCE)"
  else
    note "✓ completeness: storage_sets within $DIFF of live"
  fi
fi

# ---- CHECKPOINT 7: round-trip the newest set (row-level fidelity) ----------
if [ "${REST[storage_sets]}" -gt 0 ]; then
  CODE=$(psql "$SCRATCH" -tAc "select public_code from storage_sets order by check_in_date desc nulls last, public_code desc limit 1" 2>/dev/null)
  if [ -n "$CODE" ]; then
    RT=$(psql "$SCRATCH" -tAc "select count(*) from tires t join storage_sets s on s.id=t.set_id where s.public_code='$CODE'" 2>/dev/null || echo -1)
    LT=$(psql "$DB_URL"  -tAc "select count(*) from tires t join storage_sets s on s.id=t.set_id where s.public_code='$CODE'" 2>/dev/null || echo '?')
    if [ "$RT" = "$LT" ]; then
      note "✓ round-trip: $CODE restored with $RT tire rows (matches live)"
    else
      bad "round-trip: $CODE has $RT tire rows restored but $LT in live"
    fi
  else
    bad "round-trip: could not read a set back from the restore"
  fi
fi

# ---- verdict ---------------------------------------------------------------
if [ "$fail" = 0 ]; then
  echo "✓✓ RECOVERY DRILL PASSED — the newest backup restores cleanly, completely, and with intact relationships."
  echo "sets=${REST[storage_sets]}" >> "${GITHUB_ENV:-/dev/null}"
  exit 0
fi
echo "✗✗ RECOVERY DRILL FAILED — see the ::error:: lines above."
exit 1
