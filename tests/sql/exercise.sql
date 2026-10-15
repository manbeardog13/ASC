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
-- Count rows around the write: the backfill may already have logged this set.
do $$
declare
  v_before int;
  v_after int;
begin
  select count(*) into v_before from public.audit_events where set_code = 'ASC-2026-0004';
  update public.storage_sets set notes = 'trigger-still-fires' where public_code = 'ASC-2026-0004';
  select count(*) into v_after from public.audit_events where set_code = 'ASC-2026-0004';
  if v_after <= v_before then
    raise exception 'asc_audit trigger stopped firing after execute was revoked';
  end if;
end $$;

-- A returning customer sits next to their own set, not in the first free zone.
do $$
declare
  v jsonb;
begin
  insert into public.customers (id, name, phone)
  values ('10000000-0000-0000-0000-0000000000aa', 'Borna', '091 555 010');
  insert into public.vehicles (id, customer_id, plate)
  values ('20000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-0000000000aa', 'ZG-4532-TP');
  insert into public.locations (warehouse, zone, rack, shelf, slot) values
    ('main', '1', 'A', '', '01'),
    ('main', '2.1', 'A', '', '01'),
    ('main', '2.1', 'A', '', '03'),
    ('main', '2.1', 'A', '', '04'),
    ('main', '2.1', 'B', '', '01');
  insert into public.storage_sets (id, public_code, vehicle_id, status)
  values ('30000000-0000-0000-0000-0000000000aa', 'ASC-2026-0091', '20000000-0000-0000-0000-0000000000aa', 'in_storage');
  perform public.place_set(null, 'ASC-2026-0091', null, (
    select qr_code from public.locations
     where zone = '2.1' and rack = 'A' and slot = '03'
  ));

  v := public.suggest_free_slot('main');
  if v->>'zone' <> '1' then
    raise exception 'unordered suggest should stay on zone 1, got %', v;
  end if;
  if v->>'near_label' is not null then
    raise exception 'unordered suggest invented a neighbour %', v;
  end if;

  v := public.suggest_free_slot('main', null, null, 'zg 4532 tp');
  if v->>'zone' <> '2.1' or v->>'rack' <> 'A' or v->>'slot' <> '04' then
    raise exception 'plate cluster missed adjacent 2.1-A-04: %', v;
  end if;
  if v->>'near_label' <> '2.1-A-03' then
    raise exception 'near label is %', v->>'near_label';
  end if;

  v := public.suggest_free_slot('main', null, '091555010', null);
  if v->>'slot' <> '04' or v->>'near_label' <> '2.1-A-03' then
    raise exception 'phone cluster missed: %', v;
  end if;

  v := public.suggest_free_slot('main', '10000000-0000-0000-0000-0000000000aa', null, null);
  if v->>'slot' <> '04' then
    raise exception 'customer id cluster missed: %', v;
  end if;

  v := public.suggest_free_slot('main', null, null, 'DU100AA');
  if v->>'zone' <> '1' then
    raise exception 'unrelated plate was clustered: %', v;
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Privilege checks run as the migration owner, who can see grants.
do $$
declare
  v_path text;
  v_definer boolean;
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
  if to_regprocedure('public.suggest_free_slot(text)') is not null then
    raise exception 'old suggest_free_slot(text) is still present';
  end if;
  if not has_function_privilege('authenticated', 'public.suggest_free_slot(text,uuid,text,text)', 'execute') then
    raise exception 'staff cannot execute suggest_free_slot';
  end if;
  if has_function_privilege('anon', 'public.suggest_free_slot(text,uuid,text,text)', 'execute') then
    raise exception 'anon can execute suggest_free_slot';
  end if;
  select array_to_string(proconfig, ',') into v_path
    from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if v_path is null or position('search_path=public, pg_temp' in v_path) = 0 then
    raise exception 'set_updated_at search_path is %', v_path;
  end if;
  if has_function_privilege('public', 'public.suggest_free_slot(text,uuid,text,text)', 'execute') then
    raise exception 'public can execute suggest_free_slot';
  end if;
  select p.prosecdef, array_to_string(p.proconfig, ',') into v_definer, v_path
    from pg_proc p
   where p.oid = 'public.suggest_free_slot(text,uuid,text,text)'::regprocedure;
  if v_definer then
    raise exception 'suggest_free_slot must stay security invoker';
  end if;
  if v_path is null or position('search_path=public, pg_temp' in v_path) = 0 then
    raise exception 'suggest_free_slot search_path is %', v_path;
  end if;
end $$;

-- Definer grants and search_path. RLS helpers stay callable; triggers do not.
do $$
declare
  fn text;
  v_path text;
  v_keep text[] := array[
    'public.asc_role()',
    'public.asc_is_admin()',
    'public.set_my_name(text)',
    'public.asc_owner_email()',
    'public.mark_onboarded()'
  ];
  v_close text[] := array[
    'public.handle_new_user()',
    'public.purge_deleted(interval)',
    'public.asc_protect_owner()',
    'public.list_users()'
  ];
  v_all text[] := v_keep || v_close;
  v_pinned text[] := array[
    'asc_role', 'asc_is_admin', 'set_my_name', 'asc_owner_email',
    'mark_onboarded', 'handle_new_user', 'purge_deleted', 'asc_protect_owner', 'list_users'
  ];
begin
  foreach fn in array v_all loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can execute %', fn;
    end if;
    if has_function_privilege('public', fn, 'execute') then
      raise exception 'public can execute %', fn;
    end if;
  end loop;
  foreach fn in array v_keep loop
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated lost %', fn;
    end if;
  end loop;
  foreach fn in array v_close loop
    if has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated can still execute %', fn;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.purge_deleted(interval)', 'execute') then
    raise exception 'service_role lost purge_deleted';
  end if;
  foreach fn in array v_pinned loop
    select array_to_string(proconfig, ',') into v_path
      from pg_proc
     where proname = fn and pronamespace = 'public'::regnamespace
     order by oid
     limit 1;
    if v_path is null or position('search_path=public, pg_temp' in v_path) = 0 then
      raise exception '% search_path is %', fn, v_path;
    end if;
  end loop;
end $$;

-- Sign-in trigger still writes a profile after EXECUTE was revoked.
do $$ begin
  create role auth_writer nologin;
exception when duplicate_object then null;
end $$;
grant usage on schema auth to auth_writer;
grant insert on table auth.users to auth_writer;
set role auth_writer;
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', 'new.staff@example.com', '{"full_name":"Nova Osoba"}'::jsonb);
reset role;
do $$
begin
  if not exists (
    select 1 from public.profiles
     where id = '00000000-0000-0000-0000-0000000000aa'
       and role = 'readonly'
       and full_name = 'Nova Osoba'
  ) then
    raise exception 'handle_new_user did not create the signup profile';
  end if;
end $$;

-- Owner guard still fires.
insert into public.profiles (id, email, role)
values ('00000000-0000-0000-0000-0000000000bb', 'cryptonii13@gmail.com', 'employee')
on conflict (id) do nothing;
do $$
begin
  begin
    delete from public.profiles where id = '00000000-0000-0000-0000-0000000000bb';
    raise exception 'owner delete was allowed';
  exception when others then
    if sqlerrm not like '%cannot be removed%' then raise; end if;
  end;
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000bb') <> 'admin' then
    raise exception 'owner insert was not forced to admin';
  end if;
end $$;

-- Staff can still name themselves, stamp the tour, and read rows through RLS.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
select public.set_my_name('Ana Horvat');
do $$
declare
  v_first timestamptz;
  v_second timestamptz;
  v_sets int;
begin
  if public.asc_role() <> 'employee' then
    raise exception 'asc_role after lock is %', public.asc_role();
  end if;
  if public.asc_is_admin() then
    raise exception 'employee was treated as admin';
  end if;
  select count(*) into v_sets from public.storage_sets;
  if v_sets < 1 then
    raise exception 'RLS hid storage_sets from staff';
  end if;
  v_first := public.mark_onboarded();
  v_second := public.mark_onboarded();
  if v_first is null or v_first <> v_second then
    raise exception 'onboarded_at did not stick (% / %)', v_first, v_second;
  end if;
  begin
    perform * from public.list_users();
    raise exception 'authenticated executed list_users';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
do $$
begin
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000001') <> 'Ana Horvat' then
    raise exception 'set_my_name did not save';
  end if;
  if (select onboarded_at from public.profiles where id = '00000000-0000-0000-0000-000000000001') is null then
    raise exception 'mark_onboarded did not save';
  end if;
end $$;

-- Anon sees no sets. A missing policy and a missing grant are both safe.
set role anon;
do $$
declare v_sets int;
begin
  begin
    select count(*) into v_sets from public.storage_sets;
    if v_sets <> 0 then raise exception 'anon saw % sets', v_sets; end if;
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.asc_role();
    raise exception 'anon executed asc_role';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
