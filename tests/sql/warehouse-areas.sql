-- Disposable smoke database only. All rows/users are synthetic.
\set ON_ERROR_STOP on
begin;

-- The migration itself must preserve contents, not just counts.
do $$ declare t text; actual jsonb; begin
 for t in select table_name from warehouse_test.before_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r',t) into actual;
  if actual is distinct from (select rows from warehouse_test.before_rows where table_name=t) then
   raise exception 'migration changed operational rows: %',t;
  end if;
 end loop;
end $$;

insert into public.profiles (id,email,role) values
 ('00000000-0000-0000-0000-000000000081','wa-staff@example.test','employee'),
 ('00000000-0000-0000-0000-000000000082','wa-readonly@example.test','readonly'),
 ('00000000-0000-0000-0000-000000000083','wa-unknown@example.test','unexpected-role');
insert into public.locations (warehouse,zone,rack,shelf,slot) values
 ('main','SYN','01','1','01'),('main','SYN','02','1','01'),
 ('main','B2','01','1','01'),('other','OTHER','01','1','01');

-- Least privilege, enabled RLS, and no relationship that can cascade into inventory.
do $$ declare t text; p text; begin
 foreach t in array array['warehouse_areas','warehouse_rack_positions'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled: %',t; end if;
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   if has_table_privilege('anon','public.'||t,p) then raise exception 'anon % on %',p,t; end if;
  end loop;
  foreach p in array array['TRUNCATE','REFERENCES','TRIGGER'] loop
   if has_table_privilege('authenticated','public.'||t,p) then raise exception 'excess authenticated % on %',p,t; end if;
  end loop;
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE'] loop
   if not has_table_privilege('authenticated','public.'||t,p) then raise exception 'missing authenticated % on %',p,t; end if;
  end loop;
 end loop;
 if exists (select 1 from pg_constraint where contype='f'
   and conrelid in ('public.warehouse_areas'::regclass,'public.warehouse_rack_positions'::regclass)
   and confrelid <> 'public.warehouse_areas'::regclass) then raise exception 'map FK enters operational data'; end if;
end $$;

-- Every allowed role must perform all four operations on BOTH tables.
do $$ declare r text; begin
 foreach r in array array['admin','manager','employee','reception'] loop
  update public.profiles set role=r where id='00000000-0000-0000-0000-000000000081';
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
  set local role authenticated;
  insert into public.warehouse_areas (id,zone,name,width,depth,unit,created_by)
   values ('81000000-0000-0000-0000-000000000001',' syn ','Synthetic hall',6,4,'grid','00000000-0000-0000-0000-000000000082');
  insert into public.warehouse_rack_positions (id,area_id,rack,x,z)
   values ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','01',-1,0);
  if (select count(*) from public.warehouse_areas)<>1 or (select count(*) from public.warehouse_rack_positions)<>1 then raise exception '% cannot select',r; end if;
  if (select created_by from public.warehouse_areas)<>auth.uid() then raise exception 'spoofed creator accepted'; end if;
  update public.warehouse_areas set name='Renamed' where zone='SYN';
  if not found then raise exception '% cannot update areas',r; end if;
  update public.warehouse_rack_positions set x=1,capacity=12 where rack='01';
  if not found then raise exception '% cannot update racks',r; end if;
  delete from public.warehouse_rack_positions;
  if not found then raise exception '% cannot delete racks',r; end if;
  delete from public.warehouse_areas;
  if not found then raise exception '% cannot delete areas',r; end if;
  reset role;
 end loop;
end $$;

-- Direct API/SQL clients get the same binding and geometry constraints as the UI.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
set local role authenticated;
insert into public.warehouse_areas (id,zone,name,width,depth,unit)
 values ('81000000-0000-0000-0000-000000000001','SYN','Synthetic hall',6,4,'grid');
insert into public.warehouse_rack_positions (id,area_id,rack,x,z)
 values ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','01',-1,0);
do $$ begin
 begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('syn','Duplicate',1,1,'m');
  raise exception 'normalized duplicate accepted'; exception when unique_violation then null; end;
 begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('INVENTED','Unknown',1,1,'m');
  raise exception 'fictional zone accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('OTHER','Wrong warehouse',1,1,'m');
  raise exception 'cross-warehouse binding accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('B2','Bad size',0,1,'m');
  raise exception 'zero width accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('B2','Bad unit',1,1,'ft');
  raise exception 'bad unit accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_rack_positions(area_id,rack,x,z) values('81000000-0000-0000-0000-000000000001','01',1,0);
  raise exception 'duplicate rack accepted'; exception when unique_violation then null; end;
 begin insert into public.warehouse_rack_positions(area_id,rack,x,z) values('81000000-0000-0000-0000-000000000001','99',1,0);
  raise exception 'fictional rack accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_rack_positions(area_id,rack,x,z) values('81000000-0000-0000-0000-000000000001','02',3,0);
  raise exception 'out-of-bounds rack accepted'; exception when check_violation then null; end;
 begin insert into public.warehouse_rack_positions(area_id,rack,x,z) values('81000000-0000-0000-0000-000000000001','02',-1,0);
  raise exception 'overlap accepted'; exception when check_violation then null; end;
 begin update public.warehouse_rack_positions set capacity=17;
  raise exception 'invalid capacity accepted'; exception when check_violation then null; end;
 begin update public.warehouse_areas set width=1;
  raise exception 'shrinking across rack accepted'; exception when check_violation then null; end;
 begin update public.warehouse_areas set zone='B2';
  raise exception 'area relabel accepted'; exception when check_violation then null; end;
 begin delete from public.warehouse_areas;
  raise exception 'area with racks deleted'; exception when foreign_key_violation then null; end;
end $$;
reset role;

-- Readonly, unknown role, and a signed-in user without a profile cannot read,
-- insert, update, delete or truncate either map table. Forged user metadata
-- is not a role source: asc_role() reads the protected profiles table.
do $$ declare uid text; begin
 foreach uid in array array['00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000083','00000000-0000-0000-0000-000000000084'] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  perform set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
  set local role authenticated;
  if exists(select 1 from public.warehouse_areas) or exists(select 1 from public.warehouse_rack_positions) then raise exception 'unauthorized read: %',uid; end if;
  begin insert into public.warehouse_areas(zone,name,width,depth,unit) values('B2','Unauthorized',4,4,'m');
   raise exception 'unauthorized area insert'; exception when insufficient_privilege then null; end;
  begin insert into public.warehouse_rack_positions(area_id,rack,x,z) values('81000000-0000-0000-0000-000000000001','02',1,0);
   raise exception 'unauthorized rack insert'; exception when insufficient_privilege then null; end;
  update public.warehouse_areas set name='Unauthorized'; if found then raise exception 'unauthorized area update'; end if;
  update public.warehouse_rack_positions set x=0; if found then raise exception 'unauthorized rack update'; end if;
  delete from public.warehouse_rack_positions; if found then raise exception 'unauthorized rack delete'; end if;
  delete from public.warehouse_areas; if found then raise exception 'unauthorized area delete'; end if;
  begin truncate public.warehouse_rack_positions;
   raise exception 'unauthorized truncate'; exception when insufficient_privilege then null; end;
  reset role;
 end loop;
end $$;

-- All operational records remain byte-for-byte equivalent after map CRUD too.
-- Ignore only the explicitly inserted synthetic location fixtures above.
delete from public.locations where zone in ('SYN','B2','OTHER');
do $$ declare t text; actual jsonb; begin
 for t in select table_name from warehouse_test.before_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r',t) into actual;
  if actual is distinct from (select rows from warehouse_test.before_rows where table_name=t) then raise exception 'map CRUD changed operational rows: %',t; end if;
 end loop;
end $$;
rollback;
