#!/usr/bin/env bash
# Real pg_dump → encryption → restore test. Run as the local postgres OS user:
#   sudo -u postgres bash tests/backup-restore.sh
# Uses ONLY fresh databases on the local Unix socket; no Supabase credentials.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
export PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres PGPASSFILE=/dev/null
unset PGSERVICE PGSERVICEFILE PGPASSWORD PGOPTIONS
SOURCE_DB="asc_review_backup_source_$$"
TARGET_DB="asc_review_backup_target_$$"
WORK=$(mktemp -d)
cleanup() {
  dropdb --if-exists "$TARGET_DB" >/dev/null 2>&1 || true
  dropdb --if-exists "$SOURCE_DB" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
createdb "$SOURCE_DB"
createdb "$TARGET_DB"
psql -X -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -q -f "$REPO/tests/sql/prelude.sql" >/dev/null
psql -X -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/schema.sql" >/dev/null
psql -X -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -q -f "$REPO/supabase/migrations/20261014223000_locations_and_movements.sql" >/dev/null
# The payload is synthetic and can modify only these disposable databases if
# the old unsafe SQL interpolation regresses. Both copies must preserve it.
for database in "$SOURCE_DB" "$TARGET_DB"; do
  psql -X -d "$database" -v ON_ERROR_STOP=1 -q <<'SQL'
create table public.review_sentinel (preserved boolean not null);
insert into public.review_sentinel values (true);
SQL
done
psql -X -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into customers(id,name,phone,email) values ('90000000-0000-4000-8000-000000000001','Synthetic recovery customer','000','fixture@example.invalid');
insert into vehicles(id,customer_id,plate,make,model,year) values ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','TEST-QR','Fixture','Model',2026);
insert into locations(id,warehouse,zone,rack,shelf,slot) values
 ('90000000-0000-4000-8000-000000000003','main','fixture','A','1','01'),
 ('90000000-0000-4000-8000-000000000004','main','fixture','A','1','02');
insert into storage_sets(id,public_code,vehicle_id,location_id,zone,rack,shelf,slot,status,check_in_date)
values ('90000000-0000-4000-8000-000000000005',
 $attack$ASC-review'; update public.review_sentinel set preserved=false; select 'injection-executed'; --$attack$,
 '90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000004','fixture','A','1','02','in_storage',current_date);
update locations set status='occupied' where id='90000000-0000-4000-8000-000000000004';
insert into tires(id,set_id,size,brand,tread_mm,dot_code) values
 ('90000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000005','205/55 R16','Fixture',7,'0126'),
 ('90000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000005','205/55 R16','Fixture',7,'0126');
insert into set_movements(set_id,from_location_id,to_location_id,action) values
 ('90000000-0000-4000-8000-000000000005',null,'90000000-0000-4000-8000-000000000003','in'),
 ('90000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000004','move');
SQL
# No ambient DB_URL/ENC_KEY/GITHUB_ENV can redirect this test or disclose data.
export DB_URL="$SOURCE_DB" SCRATCH="$TARGET_DB"
export ENC_KEY='synthetic-ci-backup-key-not-a-production-secret'
export GITHUB_ENV="$WORK/github-env"
cd "$WORK"
bash "$REPO/scripts/backup.sh"
export BACKUP_DIR="$WORK/out" COUNT_TOLERANCE=0
bash "$REPO/scripts/restore-drill.sh"
for database in "$SOURCE_DB" "$TARGET_DB"; do
  preserved=$(psql -X -d "$database" -v ON_ERROR_STOP=1 -tAc 'select bool_and(preserved) from public.review_sentinel')
  [ "$preserved" = t ] || { echo 'FAIL: database text escaped its SQL literal'; exit 1; }
done
# Compare ordered exact values, not merely non-empty table counts. This proves
# slot QR identity, status, set occupancy links, and movement endpoints survive.
SNAPSHOT_SQL="select jsonb_build_object(
 'slots',(select jsonb_agg(to_jsonb(l) order by l.id) from (select id,warehouse,zone,rack,shelf,slot,qr_code,status from locations) l),
 'sets',(select jsonb_agg(to_jsonb(s) order by s.id) from (select id,public_code,location_id,status from storage_sets) s),
 'moves',(select jsonb_agg(to_jsonb(m) order by m.id) from (select id,set_id,from_location_id,to_location_id,action from set_movements) m))"
source_snapshot=$(psql -X -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -tAc "$SNAPSHOT_SQL")
target_snapshot=$(psql -X -d "$TARGET_DB" -v ON_ERROR_STOP=1 -tAc "$SNAPSHOT_SQL")
[ "$source_snapshot" = "$target_snapshot" ] || { echo 'FAIL: QR, occupancy, or movement data differs after restore'; exit 1; }
psql -X -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if (select count(*) from locations) <> 2 or (select count(*) from set_movements) <> 2 then
    raise exception 'fixture locations or movements are missing';
  end if;
end $$;
SQL
# Verify occupancy without requiring any production RPC in the restore target.
occupied=$(psql -X -d "$TARGET_DB" -v ON_ERROR_STOP=1 -tAc "select count(*) from storage_sets s join locations l on l.id=s.location_id where l.status='occupied' and s.status='in_storage'")
[ "$occupied" = 1 ] || { echo 'FAIL: occupied set-slot link was not restored'; exit 1; }
echo 'backup-restore: encrypted round-trip, SQL literal safety, exact QR identity, occupied slot, and movement history passed'
