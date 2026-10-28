-- Disposable SQL verification; all fixtures are synthetic and rolled back.
\set ON_ERROR_STOP on
begin;

-- The migration must preserve every pre-existing operational and layout row.
do $$ declare t text; actual jsonb; begin
 for t in select table_name from warehouse_binding_test.before_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r', t) into actual;
  if actual is distinct from (select rows from warehouse_binding_test.before_rows where table_name=t) then
   raise exception 'binding migration changed existing rows: %', t;
  end if;
 end loop;
end $$;

insert into public.profiles(id,email,role) values
 ('00000000-0000-0000-0000-000000000091','binding-staff@example.test','employee'),
 ('00000000-0000-0000-0000-000000000092','binding-readonly@example.test','readonly'),
 ('00000000-0000-0000-0000-000000000093','binding-customer@example.test','customer'),
 ('00000000-0000-0000-0000-000000000094','binding-unknown@example.test','unexpected-role');
insert into public.locations(warehouse,zone,rack,shelf,slot) values
 ('main','SYN-SP1','01','1','01'),('main','SYN-SP2','01','1','01'),('other','SYN-SPX','01','1','01');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
insert into public.warehouse_areas(id,warehouse,zone,name,width,depth,unit) values
 ('91000000-0000-0000-0000-000000000001','main','SYN-SP1','Synthetic space 1',6,4,'grid'),
 ('91000000-0000-0000-0000-000000000002','main','SYN-SP2','Synthetic space 2',6,4,'grid'),
 ('91000000-0000-0000-0000-000000000003','other','SYN-SPX','Synthetic other warehouse',6,4,'grid');

do $$ declare p text; begin
 if not (select relrowsecurity from pg_class where oid='public.warehouse_space_bindings'::regclass) then raise exception 'binding RLS disabled'; end if;
 foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
  if has_table_privilege('anon','public.warehouse_space_bindings',p) then raise exception 'anon has %',p; end if;
 end loop;
 foreach p in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
  if has_table_privilege('authenticated','public.warehouse_space_bindings',p) then raise exception 'excess authenticated %',p; end if;
 end loop;
 if exists(select 1 from pg_constraint where contype='f' and conrelid='public.warehouse_space_bindings'::regclass
   and (confrelid<>'public.warehouse_areas'::regclass or confdeltype<>'c')) then raise exception 'unexpected binding FK'; end if;
 if exists(select 1 from pg_proc where oid='public.validate_warehouse_space_binding()'::regprocedure and prosecdef) then raise exception 'binding trigger bypasses RLS'; end if;
 if has_function_privilege('anon','public.validate_warehouse_space_binding()','EXECUTE') or
    has_function_privilege('authenticated','public.validate_warehouse_space_binding()','EXECUTE') then raise exception 'trigger exposed as RPC'; end if;
end $$;

-- Each existing editor role reads, inserts, rebinds, and deletes shared bindings.
do $$ declare r text; begin
 foreach r in array array['admin','manager','employee','reception'] loop
  update public.profiles set role=r where id='00000000-0000-0000-0000-000000000091';
  set local role authenticated;
  insert into public.warehouse_space_bindings(warehouse,space_id,area_id,created_by)
   values('main','house-ground','91000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000092');
  if not exists(select 1 from public.warehouse_space_bindings where space_id='house-ground') then raise exception '% cannot read binding',r; end if;
  if (select created_by from public.warehouse_space_bindings where warehouse='main' and space_id='house-ground')<>auth.uid() then raise exception 'spoofed binding creator'; end if;
  update public.warehouse_space_bindings set area_id='91000000-0000-0000-0000-000000000002',created_by='00000000-0000-0000-0000-000000000092' where warehouse='main' and space_id='house-ground';
  if not found then raise exception '% cannot rebind',r; end if;
  if (select created_by from public.warehouse_space_bindings where warehouse='main' and space_id='house-ground')<>auth.uid() then raise exception 'creator changed on rebind'; end if;
  delete from public.warehouse_space_bindings where warehouse='main' and space_id='house-ground';
  if not found then raise exception '% cannot delete binding',r; end if;
  reset role;
 end loop;
end $$;

set local role authenticated;
insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values
 ('main','house-ground','91000000-0000-0000-0000-000000000001'),
 ('other','house-ground','91000000-0000-0000-0000-000000000003');
do $$ begin
 begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','house-ground','91000000-0000-0000-0000-000000000002');
  raise exception 'duplicate space accepted'; exception when unique_violation then null; end;
 begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','house-attic','91000000-0000-0000-0000-000000000001');
  raise exception 'same area assigned twice'; exception when unique_violation then null; end;
 begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','office','91000000-0000-0000-0000-000000000002');
  raise exception 'office made an inventory space'; exception when check_violation then null; end;
 begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','attic-parts','91000000-0000-0000-0000-000000000003');
  raise exception 'cross-warehouse binding accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','attic-parts','91000000-0000-0000-0000-000000000099');
  raise exception 'nonexistent area accepted'; exception when check_violation then null; end;
 begin update public.warehouse_space_bindings set area_id='91000000-0000-0000-0000-000000000003' where warehouse='main';
  raise exception 'cross-warehouse update accepted'; exception when check_violation then null; end;
 begin update public.warehouse_space_bindings set space_id='house-attic' where warehouse='main';
  raise exception 'binding key silently changed'; exception when check_violation then null; end;
end $$;
reset role;

-- Forged user metadata cannot grant access. A missing profile is also denied.
do $$ declare uid text; begin
 foreach uid in array array['00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-000000000095'] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  perform set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
  set local role authenticated;
  if exists(select 1 from public.warehouse_space_bindings) then raise exception 'unauthorized binding read: %',uid; end if;
  begin insert into public.warehouse_space_bindings(warehouse,space_id,area_id) values('main','attic-racks','91000000-0000-0000-0000-000000000002');
   raise exception 'unauthorized binding insert'; exception when insufficient_privilege then null; end;
  update public.warehouse_space_bindings set area_id='91000000-0000-0000-0000-000000000002';
  if found then raise exception 'unauthorized binding update'; end if;
  delete from public.warehouse_space_bindings;
  if found then raise exception 'unauthorized binding delete'; end if;
  begin truncate public.warehouse_space_bindings;
   raise exception 'unauthorized binding truncate'; exception when insufficient_privilege then null; end;
  reset role;
 end loop;
end $$;
set local role anon;
do $$ begin
 begin perform count(*) from public.warehouse_space_bindings;
  raise exception 'anonymous binding read'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Removing a binding preserves its area. Removing an area cascades ONLY to its
-- own binding; the existing warehouse_rack_positions delete restriction remains.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
set local role authenticated;
delete from public.warehouse_space_bindings where warehouse='other';
do $$ begin
 if not exists(select 1 from public.warehouse_areas where id='91000000-0000-0000-0000-000000000003') then raise exception 'binding deletion removed its area'; end if;
end $$;
delete from public.warehouse_areas where id='91000000-0000-0000-0000-000000000001';
do $$ begin
 if exists(select 1 from public.warehouse_space_bindings where warehouse='main' and space_id='house-ground') then raise exception 'area deletion left stale binding'; end if;
end $$;
reset role;
delete from public.warehouse_areas where id in ('91000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000003');
delete from public.locations where zone in ('SYN-SP1','SYN-SP2','SYN-SPX');
do $$ declare t text; actual jsonb; begin
 for t in select table_name from warehouse_binding_test.before_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r', t) into actual;
  if actual is distinct from (select rows from warehouse_binding_test.before_rows where table_name=t) then raise exception 'binding CRUD changed existing rows: %',t; end if;
 end loop;
end $$;
rollback;
