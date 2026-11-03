-- Run immediately before the new migration, only in a disposable database.
create schema if not exists warehouse_binding_test;
create table warehouse_binding_test.before_rows (table_name text primary key, rows jsonb not null);
do $$ declare t text; actual jsonb; begin
 foreach t in array array['customers','vehicles','storage_sets','tires','locations','warehouse_areas','warehouse_rack_positions'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r', t) into actual;
  insert into warehouse_binding_test.before_rows values(t, actual);
 end loop;
end $$;
