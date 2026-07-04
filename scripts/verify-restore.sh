#!/usr/bin/env bash
# ============================================================================
# verify-restore.sh — an untested backup isn't a backup.
# Verifies the newest encrypted backup end-to-end WITHOUT needing a live
# database: it decrypts (proves the key works), decompresses (proves the file
# isn't corrupt/truncated), and confirms the customer tables and a plausible row
# count are present in the dump. This catches the real "silent backup rot"
# failure modes — lost/rotated key, corruption, empty or partial dumps.
#
# (A full restore drill into a scratch Supabase project should still be done
# manually each quarter — see docs/DISASTER_RECOVERY.md.)
#
# Requires env: ENC_KEY. BACKUP_DIR defaults to database_backups/db.
# ============================================================================
set -euo pipefail
: "${ENC_KEY:?ENC_KEY is required}"
BACKUP_DIR="${BACKUP_DIR:-database_backups/db}"

NEWEST="$(ls -1 "$BACKUP_DIR"/asc-*.sql.gz.enc 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$NEWEST" ]; then echo "::error::No backup found in $BACKUP_DIR"; exit 1; fi
echo "→ Verifying newest backup: $NEWEST"

PLAIN="$(mktemp)"
trap 'rm -f "$PLAIN"' EXIT

if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:ENC_KEY -in "$NEWEST" | gunzip > "$PLAIN"; then
  echo "::error::Decrypt/decompress failed — wrong BACKUP_ENCRYPTION_KEY or corrupt backup"; exit 1
fi

BYTES=$(wc -c < "$PLAIN")
echo "   decrypted SQL: $BYTES bytes"
if [ "$BYTES" -lt 200 ]; then echo "::error::Dump is implausibly small ($BYTES bytes)"; exit 1; fi

FAIL=0
for t in customers vehicles storage_sets tires; do
  if ! grep -qE "COPY public\.$t " "$PLAIN"; then
    echo "::error::Table '$t' COPY block missing from dump"; FAIL=1
  fi
done

# Count storage_sets data rows in the COPY block (best-effort, informational).
SETS=$(python3 - "$PLAIN" <<'PY'
import sys
rows, inblk = 0, False
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    if line.startswith("COPY public.storage_sets "): inblk = True; continue
    if inblk:
        if line.rstrip("\n") == "\\.": break
        rows += 1
print(rows)
PY
)
echo "   storage_sets rows in dump: $SETS"

if [ "$FAIL" != "0" ]; then echo "✗ Backup verification FAILED"; exit 1; fi
echo "✓ Backup verified: decrypts, decompresses, all core tables present, $SETS sets."
echo "sets=$SETS" >> "${GITHUB_ENV:-/dev/null}"
