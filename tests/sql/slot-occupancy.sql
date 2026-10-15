-- DISPOSABLE smoke database only, after the proposed occupancy migration.
\set ON_ERROR_STOP on
begin;
insert into public.profiles (id, email, role) values
 ('00000000-0000-0000-0000-000000000073', 'occupancy-staff@example.test', 'employee'),
 ('00000000-0000-0000-0000-000000000074', 'occupancy-admin@example.test', 'admin');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000073', true);
set local role authenticated;
insert into public.locations (id, warehouse, zone, rack, shelf, slot) values
 ('76000000-0000-0000-0000-000000000001', 'occupancy-fixture', 'A', '1', '1', '1'),
 ('76000000-0000-0000-0000-000000000002', 'occupancy-fixture', 'B', '1', '1', '1'),
 ('76000000-0000-0000-0000-000000000003', 'occupancy-fixture', 'C', '1', '1', '1'),
 ('76000000-0000-0000-0000-000000000004', 'occupancy-fixture', 'D', '1', '1', '1'),
 ('76000000-0000-0000-0000-000000000005', 'occupancy-fixture', 'E', '1', '1', '1');
insert into public.storage_sets (id, public_code) values
 ('75000000-0000-0000-0000-000000000001', 'ASC-2099-9701'),
 ('75000000-0000-0000-0000-000000000002', 'ASC-2099-9702'),
 ('75000000-0000-0000-0000-000000000003', 'ASC-2099-9703'),
 ('75000000-0000-0000-0000-000000000004', 'ASC-2099-9704');

select public.place_set('75000000-0000-0000-0000-000000000001', null, '76000000-0000-0000-0000-000000000001', null);
update public.storage_sets set deleted_at = now() where id = '75000000-0000-0000-0000-000000000001';
do $$ begin
 if (select status from public.locations where id = '76000000-0000-0000-0000-000000000001') <> 'free' then
   raise exception 'recycle did not free slot'; end if;
 if (select count(*) from public.set_movements where set_id = '75000000-0000-0000-0000-000000000001') <> 1 then
   raise exception 'recycle invented a scan movement'; end if;
end $$;

update public.storage_sets set deleted_at = null where id = '75000000-0000-0000-0000-000000000001';
do $$ begin
 if (select status from public.locations where id = '76000000-0000-0000-0000-000000000001') <> 'occupied' then
   raise exception 'restore did not occupy slot'; end if;
end $$;
update public.storage_sets set deleted_at = now() where id = '75000000-0000-0000-0000-000000000001';
select public.place_set('75000000-0000-0000-0000-000000000002', null, '76000000-0000-0000-0000-000000000001', null);
do $$ begin
 begin
   update public.storage_sets set deleted_at = null where id = '75000000-0000-0000-0000-000000000001';
   raise exception 'restore was allowed into another set''s slot';
 exception when unique_violation then null;
 end;
 if (select deleted_at from public.storage_sets where id = '75000000-0000-0000-0000-000000000001') is null then
   raise exception 'failed restore changed the recycled set'; end if;
end $$;

select public.move_set('75000000-0000-0000-0000-000000000002', null, '76000000-0000-0000-0000-000000000002', null);
update public.locations set status = 'blocked' where id = '76000000-0000-0000-0000-000000000001';
do $$ begin
 begin
   update public.storage_sets set deleted_at = null where id = '75000000-0000-0000-0000-000000000001';
   raise exception 'restore was allowed into a blocked slot';
 exception when check_violation then null;
 end;
 if (select deleted_at from public.storage_sets where id = '75000000-0000-0000-0000-000000000001') is null then
   raise exception 'blocked restore changed the recycled set'; end if;
end $$;

select public.place_set('75000000-0000-0000-0000-000000000003', null, '76000000-0000-0000-0000-000000000003', null);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000074', true);
delete from public.storage_sets where id in ('75000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000003');
do $$ begin
 if (select status from public.locations where id = '76000000-0000-0000-0000-000000000003') <> 'free' then
   raise exception 'purge did not free the live slot'; end if;
 if (select status from public.locations where id = '76000000-0000-0000-0000-000000000001') <> 'blocked' then
   raise exception 'purge unblocked the old slot'; end if;
end $$;

-- Existing scan RPCs must retain their responses and movement semantics.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000073', true);
select public.place_set('75000000-0000-0000-0000-000000000004', null, '76000000-0000-0000-0000-000000000004', null);
select public.place_set('75000000-0000-0000-0000-000000000004', null, '76000000-0000-0000-0000-000000000004', null);
select public.move_set('75000000-0000-0000-0000-000000000004', null, '76000000-0000-0000-0000-000000000005', null);
select public.checkout_set('75000000-0000-0000-0000-000000000004', null);
select public.checkout_set('75000000-0000-0000-0000-000000000004', null);
do $$ begin
 if (select count(*) from public.set_movements where set_id = '75000000-0000-0000-0000-000000000004') <> 3 then
   raise exception 'place/move/checkout/idempotency semantics changed'; end if;
 if exists (select 1 from public.locations where id in ('76000000-0000-0000-0000-000000000004','76000000-0000-0000-0000-000000000005') and status <> 'free') then
   raise exception 'move/checkout left a stale occupied slot'; end if;
 if exists (select 1 from public.storage_sets where id = '75000000-0000-0000-0000-000000000004' and (location_id is not null or status <> 'checked_out')) then
   raise exception 'checkout changed its record contract'; end if;
end $$;
reset role;
do $$ begin
 if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='asc_sync_slot_occupancy' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then
   raise exception 'occupancy trigger widened function access'; end if;
end $$;
rollback;
