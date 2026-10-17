-- Disposable smoke database only. Synthetic users; no production mutations.
\set ON_ERROR_STOP on
begin;
insert into public.profiles (id, email, role) values
  ('00000000-0000-0000-0000-000000000081', 'wa-staff@example.test', 'employee'),
  ('00000000-0000-0000-0000-000000000082', 'wa-ro@example.test', 'readonly')
on conflict (id) do update set role = excluded.role;

do $$
declare t text; p text;
begin
  foreach t in array array['warehouse_areas', 'warehouse_rack_positions'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) then raise exception 'anon % on %', p, t; end if;
    end loop;
  end loop;
  -- No cascade/foreign key from the new tables into operational data.
  if exists (select 1 from pg_constraint c where c.contype = 'f'
      and c.conrelid in ('public.warehouse_areas'::regclass, 'public.warehouse_rack_positions'::regclass)
      and c.confrelid not in ('public.warehouse_areas'::regclass)) then
    raise exception 'unexpected foreign key from map tables';
  end if;
end $$;

create temp table wa_counts as
  select (select count(*) from public.customers) c, (select count(*) from public.storage_sets) s,
         (select count(*) from public.tires) t, (select count(*) from public.locations) l;
grant select on wa_counts to authenticated;

-- Staff can create an area and a rack position.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);
set local role authenticated;
insert into public.warehouse_areas (id, zone, name, width, depth, unit)
  values ('81000000-0000-0000-0000-000000000001', 'SYN', 'Synthetic hall', 6, 4, 'grid');
insert into public.warehouse_rack_positions (area_id, rack, x, z) values ('81000000-0000-0000-0000-000000000001', '01', -1, 0);
do $$ begin
  if (select created_by from public.warehouse_areas where zone = 'SYN') is distinct from '00000000-0000-0000-0000-000000000081'::uuid then
    raise exception 'created_by not stamped'; end if;
  begin insert into public.warehouse_areas (zone, name, width, depth, unit) values ('SYN', 'dup', 1, 1, 'm');
    raise exception 'duplicate zone accepted'; exception when unique_violation then null; end;
  begin insert into public.warehouse_areas (zone, name, width, depth, unit) values ('BAD', 'x', 0, 1, 'm');
    raise exception 'zero width accepted'; exception when check_violation then null; end;
  begin insert into public.warehouse_areas (zone, name, width, depth, unit) values ('BAD2', 'x', 1, 1, 'ft');
    raise exception 'bad unit accepted'; exception when check_violation then null; end;
  begin insert into public.warehouse_rack_positions (area_id, rack, x, z) values ('81000000-0000-0000-0000-000000000001', '01', 1, 1);
    raise exception 'duplicate rack accepted'; exception when unique_violation then null; end;
  begin delete from public.warehouse_areas where zone = 'SYN';
    raise exception 'area with positions deleted'; exception when foreign_key_violation then null; end;
end $$;
reset role;

-- Readonly sees nothing and cannot write.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000082', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.warehouse_areas) then raise exception 'readonly can read areas'; end if;
  begin insert into public.warehouse_areas (zone, name, width, depth, unit) values ('RO', 'x', 1, 1, 'm');
    raise exception 'readonly insert accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  if (select row(c, s, t, l) from wa_counts) is distinct from
     (select row((select count(*) from public.customers), (select count(*) from public.storage_sets),
                 (select count(*) from public.tires), (select count(*) from public.locations))) then
    raise exception 'operational data changed'; end if;
end $$;
rollback;
