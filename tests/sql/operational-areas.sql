-- Disposable regression gate only. All operational fixtures are synthetic.
\set ON_ERROR_STOP on
begin;
do $$ declare t text; actual jsonb; begin
  for t in select table_name from warehouse_test.before_rows loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r', t) into actual;
    if actual is distinct from (select rows from warehouse_test.before_rows where table_name=t) then
      raise exception 'Warehouse bootstrap changed pre-existing operational records: %',t;
    end if;
  end loop;
  if (select count(*) from public.warehouse_rack_positions) <> 0 then raise exception 'Bootstrap invented rack positions'; end if;
  if exists (
    select 1 from (values ('2.1','house-ground',10,14),('2.2','house-platform',10,14),('2.3','house-attic',10,14),
                         ('POLICE','attic-parts',12,32),('REGALI','attic-racks',10,32),('TROKUT','triangular-store',5,7))
                      v(zone,space_id,width,depth)
    where not exists(select 1 from public.warehouse_areas a join public.warehouse_space_bindings b on b.area_id=a.id and b.warehouse=a.warehouse
                     where a.warehouse='main' and a.zone=v.zone and b.space_id=v.space_id and a.unit='grid' and a.width=v.width and a.depth=v.depth)
  ) then raise exception 'Bootstrap failed to create exactly the intended room bindings and relative dimensions'; end if;
end $$;

insert into public.profiles(id,email,role) values
 ('00000000-0000-0000-0000-000000000071','operational-staff@example.test','employee'),
 ('00000000-0000-0000-0000-000000000072','operational-readonly@example.test','readonly');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
do $$ declare a uuid; begin
  if (select count(*) from public.warehouse_space_bindings where warehouse='main') <> 6 then raise exception 'Staff cannot load all six rooms'; end if;
  insert into public.warehouse_areas(warehouse,zone,name,width,depth,unit) values ('main','  qa empty ','Synthetic empty area',5,7,'grid') returning id into a;
  if not exists(select 1 from public.warehouse_areas where id=a and zone='QA EMPTY') then raise exception 'Staff empty-area provisioning or normalization failed'; end if;
  begin
    insert into public.warehouse_rack_positions(area_id,rack,x,z,capacity) values(a,'RK01',0,0,8);
    raise exception 'Placed nonexistent rack in an empty zone';
  exception when check_violation then null; end;
  insert into public.locations(warehouse,zone,rack,shelf,slot) values('main','QA EMPTY','RK01','01','01');
  insert into public.warehouse_rack_positions(area_id,rack,x,z,capacity) values(a,'RK01',0,0,8);
  if not exists(select 1 from public.warehouse_rack_positions where area_id=a and rack='RK01') then raise exception 'Staff rack position not saved'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000072',true);
do $$ begin
  if exists(select 1 from public.warehouse_space_bindings) or exists(select 1 from public.warehouse_areas) then raise exception 'Nonstaff profile can read warehouse layout'; end if;
  begin
    insert into public.warehouse_areas(warehouse,zone,name,width,depth,unit) values('main','DENIED','Denied',2,2,'grid');
    raise exception 'Nonstaff was allowed to create an empty area';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin perform 1 from public.warehouse_space_bindings; raise exception 'Anonymous layout access unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
