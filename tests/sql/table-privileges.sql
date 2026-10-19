-- DISPOSABLE DATABASE ONLY. Run after the normal smoke schema and migrations.
-- psql -v ON_ERROR_STOP=1 -v grant_migration=/absolute/path/to/generated.sql \
--   -f out/platform-review/database/table_privileges.fixture.sql
-- This fixture seeds the inherited broad grants that caused the defect, then
-- applies the actual proposed migration. It snapshots existing CRUD grants and
-- RLS settings rather than assuming a new authorization policy.
\set ON_ERROR_STOP on
begin;

create temporary table grant_targets (table_name text primary key) on commit drop;
insert into grant_targets values
  ('audit_events'), ('allowed_emails'), ('backup_runs'), ('builder_relay_log'),
  ('customers'), ('locations'), ('photos'), ('profiles'), ('set_movements'),
  ('storage_sets'), ('tires'), ('vehicles');

create temporary table expected_crud on commit drop as
select t.table_name, r.role_name, p.privilege,
       has_table_privilege(r.role_name, 'public.' || t.table_name, p.privilege) as allowed
from grant_targets t
cross join (values ('anon'), ('authenticated')) r(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege);

create temporary table expected_rls on commit drop as
select c.oid, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join grant_targets t on t.table_name = c.relname
where n.nspname = 'public';

-- Simulate both directly inherited role grants and grants inherited via PUBLIC.
do $$ declare t record; begin
  for t in select table_name from grant_targets loop
    execute format('grant truncate, references, trigger on table public.%I to public, anon, authenticated', t.table_name);
  end loop;
end $$;

do $$ begin
  if exists (
    select 1 from grant_targets t
    cross join (values ('anon'), ('authenticated')) r(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
    where not has_table_privilege(r.role_name, 'public.' || t.table_name, p.privilege)
  ) then raise exception 'fixture did not recreate inherited broad privileges'; end if;
end $$;

\i :grant_migration

do $$ declare bad record; begin
  select t.table_name, r.role_name, p.privilege into bad
  from grant_targets t
  cross join (values ('anon'), ('authenticated')) r(role_name)
  cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
  where has_table_privilege(r.role_name, 'public.' || t.table_name, p.privilege)
  limit 1;
  if found then
    raise exception 'excess effective privilege: % % %', bad.role_name, bad.table_name, bad.privilege;
  end if;
  select * into bad from expected_crud e
  where has_table_privilege(e.role_name, 'public.' || e.table_name, e.privilege) is distinct from e.allowed
  limit 1;
  if found then
    raise exception 'CRUD permission changed: % % %', bad.role_name, bad.table_name, bad.privilege;
  end if;
  if exists (
    select 1 from expected_rls e join pg_class c on c.oid = e.oid
    where c.relrowsecurity is distinct from e.relrowsecurity
       or c.relforcerowsecurity is distinct from e.relforcerowsecurity
  ) then raise exception 'RLS configuration changed'; end if;
end $$;

rollback;
