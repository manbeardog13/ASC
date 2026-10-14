-- Runs as the staff user. Fails the script on the first unexpected result.
\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.email', 'staff@example.com', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;

-- Newer of the two sets that shared A/01/1/1 owns the slot. The older keeps text only.
do $$
declare
  v_new uuid;
  v_old uuid;
  v_count int;
begin
  select location_id into v_new from public.storage_sets where public_code = 'ASC-2026-0002';
  select location_id into v_old from public.storage_sets where public_code = 'ASC-2026-0001';
  if v_new is null then raise exception 'backfill did not link the newer set'; end if;
  if v_old is not null then raise exception 'backfill linked two sets to one slot'; end if;
  select count(*) into v_count from public.locations where status = 'occupied';
  if v_count <> 2 then raise exception 'expected 2 occupied slots, got %', v_count; end if;
end $$;

-- Suggest skips occupied slots.
do $$
declare v jsonb;
begin
  v := public.suggest_free_slot(null);
  if v is not null then raise exception 'no free slot was created yet, suggest returned %', v; end if;
end $$;

insert into public.locations (warehouse, zone, rack, shelf, slot)
values ('main', 'C', '01', '1', '1'), ('main', 'C', '01', '1', '2');

do $$
declare
  v jsonb;
  v_code text;
  v_moves int;
  v_free int;
  v_audit int;
begin
  v := public.suggest_free_slot('main');
  if v->>'qr_code' is null then raise exception 'suggest returned no slot'; end if;
  if v->>'zone' <> 'C' then raise exception 'suggest did not pick zone C: %', v; end if;

  v := public.place_set(null, 'ASC-2026-0003', null, v->>'qr_code');
  if v->>'ok' <> 'true' then raise exception 'place failed %', v; end if;
  v_code := v->'location'->>'qr_code';

  begin
    perform public.place_set(null, 'ASC-2026-0001', null, v_code);
    raise exception 'an empty set was placed into an occupied slot';
  exception when others then
    if sqlerrm not like '%already holds%' then raise; end if;
  end;

  -- Same scan again does not add a second movement.
  perform public.place_set(null, 'ASC-2026-0003', null, v_code);
  select count(*) into v_moves from public.set_movements m
    join public.storage_sets s on s.id = m.set_id
   where s.public_code = 'ASC-2026-0003' and m.action = 'in';
  if v_moves <> 1 then raise exception 'idempotent place wrote % movements', v_moves; end if;

  begin
    perform public.place_set(null, 'ASC-2026-0004', null, v_code);
    raise exception 'second set was allowed into a full slot';
  exception when others then
    if sqlerrm not like '%already holds%' and sqlerrm not like '%already in a slot%' then
      raise;
    end if;
  end;

  v := public.move_set(null, 'ASC-2026-0003', null, (
    select qr_code from public.locations where zone = 'C' and slot = '2'
  ));
  if coalesce(v->>'action', '') not in ('move', 'in') then raise exception 'move failed %', v; end if;
  select count(*) into v_free from public.locations where zone = 'C' and slot = '1' and status = 'free';
  if v_free <> 1 then raise exception 'old slot was not freed'; end if;

  perform public.checkout_set(null, 'ASC-2026-0003');
  if (select status from public.storage_sets where public_code = 'ASC-2026-0003') <> 'checked_out' then
    raise exception 'checkout did not mark the set';
  end if;
  if (select location_id from public.storage_sets where public_code = 'ASC-2026-0003') is not null then
    raise exception 'checkout left the set linked';
  end if;
  -- Text fields stay so staff can see the last place.
  if (select slot from public.storage_sets where public_code = 'ASC-2026-0003') is distinct from '2' then
    raise exception 'checkout cleared the text location';
  end if;
  select count(*) into v_free from public.locations where zone = 'C' and status = 'free';
  if v_free <> 2 then raise exception 'checkout did not free the slot, free=%', v_free; end if;

  select count(*) into v_audit from public.audit_events
   where set_code = 'ASC-2026-0003' and action in ('placed', 'moved', 'checked_out');
  if v_audit < 3 then raise exception 'RPC audit rows missing: %', v_audit; end if;
end $$;

-- Trigger still records an update after asc_audit() execute was revoked.
update public.storage_sets set notes = 'trigger-still-fires' where public_code = 'ASC-2026-0004';
do $$
begin
  if not exists (
    select 1 from public.audit_events
     where set_code = 'ASC-2026-0004' and summary = 'trigger'
  ) then
    raise exception 'asc_audit trigger stopped firing after execute was revoked';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Privilege checks run as the migration owner, who can see grants.
do $$
declare
  v_path text;
begin
  if has_function_privilege('anon', 'public.asc_audit()', 'execute') then
    raise exception 'anon can still execute asc_audit()';
  end if;
  if has_function_privilege('public', 'public.asc_audit()', 'execute') then
    raise exception 'public can still execute asc_audit()';
  end if;
  if has_function_privilege('authenticated', 'public.asc_audit()', 'execute') then
    raise exception 'authenticated can still execute asc_audit()';
  end if;
  if has_function_privilege('anon', 'public.place_set(uuid,text,uuid,text)', 'execute') then
    raise exception 'anon can execute place_set';
  end if;
  if not has_function_privilege('authenticated', 'public.place_set(uuid,text,uuid,text)', 'execute') then
    raise exception 'staff cannot execute place_set';
  end if;
  if not has_function_privilege('authenticated', 'public.checkout_set(uuid,text)', 'execute') then
    raise exception 'staff cannot execute checkout_set';
  end if;
  if not has_function_privilege('authenticated', 'public.suggest_free_slot(text)', 'execute') then
    raise exception 'staff cannot execute suggest_free_slot';
  end if;
  select array_to_string(proconfig, ',') into v_path
    from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if v_path is null or position('search_path=public, pg_temp' in v_path) = 0 then
    raise exception 'set_updated_at search_path is %', v_path;
  end if;
end $$;
