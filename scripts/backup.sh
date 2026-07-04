#!/usr/bin/env bash
# ============================================================================
# backup.sh — encrypted DATA-ONLY database dump + encrypted CSV snapshot.
#
# Structure (tables, policies, triggers, roles) lives in version control at
# supabase/schema.sql, so backups only carry the customer DATA. This keeps the
# dump free of Supabase's auth/storage coupling, so it restores cleanly into any
# project where schema.sql has been run (see docs/DISASTER_RECOVERY.md).
#
# Because the repository is PUBLIC, nothing is ever written in plaintext — the
# dump and CSV are AES-256 encrypted with a key that lives only in a GitHub
# Actions secret.
#
# Requires env: DB_URL (Postgres connection string), ENC_KEY (passphrase).
# Writes: out/asc-<date>.sql.gz.enc  and  out/asc-<date>.csv.enc
# ============================================================================
set -euo pipefail
: "${DB_URL:?DB_URL is required}"
: "${ENC_KEY:?ENC_KEY is required}"

STAMP="$(date -u +%Y-%m-%d)"
OUT="out"
mkdir -p "$OUT"

echo "→ Dumping customer data (data-only; triggers disabled so restore won't re-fire the audit log)…"
pg_dump "$DB_URL" --data-only --no-owner --no-privileges --disable-triggers \
  --table=public.customers --table=public.vehicles --table=public.storage_sets \
  --table=public.tires --table=public.photos --table=public.audit_events \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:ENC_KEY \
  > "$OUT/asc-$STAMP.sql.gz.enc"

echo "→ Writing CSV inventory snapshot (one row per tire)…"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "\copy (
  select s.public_code, s.status, s.season, s.zone, s.rack, s.shelf, s.slot,
         s.check_in_date, s.expected_out_date, s.picked_up_at, s.fee, s.paid,
         c.name as customer, c.phone, c.email,
         v.plate, v.make, v.model, v.year,
         t.position, t.size, t.brand, t.tread_mm, t.dot_code, t.studded
  from storage_sets s
  left join vehicles v on v.id = s.vehicle_id
  left join customers c on c.id = v.customer_id
  left join tires t on t.set_id = s.id
  where s.deleted_at is null
  order by s.public_code
) to stdout with csv header" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:ENC_KEY \
  > "$OUT/asc-$STAMP.csv.enc"

DB_BYTES=$(wc -c < "$OUT/asc-$STAMP.sql.gz.enc")
{
  echo "db_bytes=$DB_BYTES"
  echo "stamp=$STAMP"
} >> "${GITHUB_ENV:-/dev/null}"
echo "✓ Backup created: asc-$STAMP (encrypted, ${DB_BYTES} bytes)"
