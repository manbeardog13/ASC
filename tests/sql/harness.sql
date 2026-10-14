-- Throwaway schema that matches the columns the locations migration reads.
-- Not production. auth.uid()/auth.jwt() are stubs so the RPCs can be exercised.

create extension if not exists pgcrypto;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'email', current_setting('request.jwt.claim.email', true),
    'role', current_setting('request.jwt.claim.role', true)
  );
$$;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  make text, model text, year int, plate text, vin text,
  created_at timestamptz not null default now()
);
create table if not exists public.storage_sets (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  season text not null default 'winter',
  on_rims boolean not null default false,
  rim_type text,
  quantity int not null default 4,
  zone text, rack text, shelf text, slot text,
  check_in_date date not null default current_date,
  expected_out_date date,
  fee numeric(10,2),
  paid boolean not null default false,
  status text not null default 'in_storage',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  picked_up_at timestamptz,
  reserved_at timestamptz
);
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  role text not null default 'employee'
);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  entity_type text not null,
  entity_id uuid,
  set_code text,
  action text not null,
  summary text,
  changes jsonb not null default '{}'::jsonb
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_sets_updated on public.storage_sets;
create trigger trg_sets_updated before update on public.storage_sets
  for each row execute function public.set_updated_at();

create or replace function public.asc_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'readonly');
$$;
create or replace function public.asc_is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.asc_role() in ('admin', 'manager');
$$;

create or replace function public.asc_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_events (actor, actor_email, entity_type, entity_id, set_code, action, summary)
  values (auth.uid(), auth.jwt() ->> 'email', tg_table_name, new.id, new.public_code, 'updated', 'trigger');
  return new;
end;
$$;
drop trigger if exists trg_audit_sets on public.storage_sets;
create trigger trg_audit_sets after update on public.storage_sets
  for each row execute function public.asc_audit();

alter table public.storage_sets enable row level security;
alter table public.audit_events enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;

drop policy if exists sets_select on public.storage_sets;
drop policy if exists sets_insert on public.storage_sets;
drop policy if exists sets_update on public.storage_sets;
create policy sets_select on public.storage_sets for select to authenticated using (public.asc_role() <> 'readonly');
create policy sets_insert on public.storage_sets for insert to authenticated
  with check (public.asc_role() in ('admin','manager','employee','reception'));
create policy sets_update on public.storage_sets for update to authenticated
  using (public.asc_role() in ('admin','manager','employee','reception'))
  with check (public.asc_role() in ('admin','manager','employee','reception'));
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events for select to authenticated using (public.asc_role() <> 'readonly');
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists customers_rw on public.customers;
create policy customers_rw on public.customers for all to authenticated
  using (public.asc_role() <> 'readonly') with check (public.asc_role() <> 'readonly');
drop policy if exists vehicles_rw on public.vehicles;
create policy vehicles_rw on public.vehicles for all to authenticated
  using (public.asc_role() <> 'readonly') with check (public.asc_role() <> 'readonly');

grant select, insert, update on public.storage_sets, public.customers, public.vehicles, public.audit_events, public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into public.profiles (id, email, role)
values ('00000000-0000-0000-0000-000000000001', 'staff@example.com', 'employee')
on conflict (id) do nothing;

insert into public.customers (id, name) values ('10000000-0000-0000-0000-000000000001', 'Ana')
on conflict (id) do nothing;
insert into public.vehicles (id, customer_id, plate) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'DU-100-AA')
on conflict (id) do nothing;

insert into public.storage_sets (id, public_code, vehicle_id, zone, rack, shelf, slot, status, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', 'ASC-2026-0001', '20000000-0000-0000-0000-000000000001', 'A', '01', '1', '1', 'in_storage', now() - interval '2 days'),
  ('30000000-0000-0000-0000-000000000002', 'ASC-2026-0002', '20000000-0000-0000-0000-000000000001', 'A', '01', '1', '1', 'in_storage', now() - interval '1 day'),
  ('30000000-0000-0000-0000-000000000003', 'ASC-2026-0003', '20000000-0000-0000-0000-000000000001', null, null, null, null, 'in_storage', now()),
  ('30000000-0000-0000-0000-000000000004', 'ASC-2026-0004', '20000000-0000-0000-0000-000000000001', 'B', '02', '1', '4', 'in_storage', now())
on conflict (id) do nothing;
