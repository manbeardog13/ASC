#!/usr/bin/env bash
# DISPOSABLE local Postgres only. Run as the smoke database owner, after migrations.
# bash out/platform-review/database/slot_occupancy.race.sh asc_mig
set -euo pipefail
test_db="${1:-asc_mig}"
if [[ "$test_db" != asc_mig && "$test_db" != asc_test* ]]; then
  echo 'Use only a disposable asc_mig or asc_test* database.' >&2
  exit 2
fi
a_pid=''
run_sql() { psql -X -q -d "$test_db" -v ON_ERROR_STOP=1 -o /dev/null; }
cleanup() {
  if [[ -n "$a_pid" ]]; then kill "$a_pid" 2>/dev/null || true; wait "$a_pid" 2>/dev/null || true; fi
  run_sql <<'SQL' || true
delete from public.storage_sets where id in ('75100000-0000-0000-0000-000000000001','75100000-0000-0000-0000-000000000002');
delete from public.locations where id='76100000-0000-0000-0000-000000000001';
delete from public.profiles where id='00000000-0000-0000-0000-000000000075';
SQL
}
trap cleanup EXIT
run_sql <<'SQL'
insert into public.profiles(id,email,role) values ('00000000-0000-0000-0000-000000000075','occupancy-race@example.test','employee');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000075',false);
set role authenticated;
insert into public.locations(id,warehouse,zone,rack,shelf,slot) values ('76100000-0000-0000-0000-000000000001','occupancy-race','R','1','1','1');
insert into public.storage_sets(id,public_code,location_id,deleted_at) values ('75100000-0000-0000-0000-000000000001','ASC-2099-9711','76100000-0000-0000-0000-000000000001',now());
insert into public.storage_sets(id,public_code) values ('75100000-0000-0000-0000-000000000002','ASC-2099-9712');
SQL

await_signal() {
  for ((i=0; i<100; i++)); do
    signal="$(psql -X -Atq -d "$test_db" -v ON_ERROR_STOP=1 -c "select exists(select 1 from pg_locks where locktype='advisory' and classid=963 and objid=1 and granted and database=(select oid from pg_database where datname=current_database()))")"
    if [[ "$signal" == t ]]; then return; fi
    if ! kill -0 "$a_pid" 2>/dev/null; then wait "$a_pid"; echo 'Concurrency fixture ended before its signal.' >&2; exit 1; fi
    sleep 0.05
  done
  echo 'Concurrency fixture signal timed out.' >&2
  exit 1
}

# A restores first. B must reject placement after A commits, without a deadlock.
run_sql <<'SQL' &
begin;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000075',true);
set local role authenticated;
update public.storage_sets set deleted_at=null where id='75100000-0000-0000-0000-000000000001';
select pg_advisory_xact_lock(963,1);
select pg_sleep(2);
commit;
SQL
a_pid=$!
await_signal
run_sql <<'SQL'
begin;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000075',true);
set local role authenticated;
do $$ begin
 begin
  perform public.place_set('75100000-0000-0000-0000-000000000002',null,'76100000-0000-0000-0000-000000000001',null);
  raise exception 'concurrent placement displaced restored set';
 exception when others then
  if sqlerrm not like '%already holds%' then raise; end if;
 end;
end $$;
commit;
SQL
wait "$a_pid"
a_pid=''
run_sql <<'SQL'
do $$ begin
 if (select deleted_at from public.storage_sets where id='75100000-0000-0000-0000-000000000001') is not null or
    (select location_id from public.storage_sets where id='75100000-0000-0000-0000-000000000002') is not null or
    (select status from public.locations where id='76100000-0000-0000-0000-000000000001') <> 'occupied' then
  raise exception 'restore-wins race left inconsistent state';
 end if;
end $$;
update public.storage_sets set deleted_at=now() where id='75100000-0000-0000-0000-000000000001';
SQL

# A locks the destination before changing its set (the place RPC lock order).
# B attempts restore while A owns the slot. With an AFTER-only trigger B could
# enter the unique index before waiting for A, creating the inverse lock cycle.
run_sql <<'SQL' &
begin;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000075',true);
set local role authenticated;
select 1 from public.locations where id='76100000-0000-0000-0000-000000000001' for update;
select pg_advisory_xact_lock(963,1);
select pg_sleep(2);
select public.place_set('75100000-0000-0000-0000-000000000002',null,'76100000-0000-0000-0000-000000000001',null);
commit;
SQL
a_pid=$!
await_signal
run_sql <<'SQL'
begin;
set local statement_timeout='8s';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000075',true);
set local role authenticated;
do $$ begin
 begin
  update public.storage_sets set deleted_at=null where id='75100000-0000-0000-0000-000000000001';
  raise exception 'concurrent restore displaced placed set';
 exception when unique_violation then null;
 end;
end $$;
commit;
SQL
wait "$a_pid"
a_pid=''
run_sql <<'SQL'
do $$ begin
 if (select deleted_at from public.storage_sets where id='75100000-0000-0000-0000-000000000001') is null or
    (select location_id from public.storage_sets where id='75100000-0000-0000-0000-000000000002') is distinct from '76100000-0000-0000-0000-000000000001'::uuid or
    (select status from public.locations where id='76100000-0000-0000-0000-000000000001') <> 'occupied' then
  raise exception 'place-wins race left inconsistent state';
 end if;
end $$;
SQL
echo 'Occupancy concurrency fixtures passed.'
