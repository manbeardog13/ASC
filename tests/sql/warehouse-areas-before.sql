-- Disposable database only. Capture complete operational rows immediately
-- before the warehouse migration, including a non-empty synthetic tire table.
\set ON_ERROR_STOP on
insert into public.tires (id, set_id, size, condition_notes) values
 ('81000000-0000-0000-0000-000000000099', '30000000-0000-0000-0000-000000000001', '205/55 R16', 'Synthetic preservation sentinel');
create schema warehouse_test;
create table warehouse_test.before_rows (table_name text primary key, rows jsonb);
do $$ declare t text; begin
 foreach t in array array['customers','vehicles','storage_sets','tires','locations'] loop
  execute format('insert into warehouse_test.before_rows select %L, coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r',t,t);
 end loop;
end $$;
