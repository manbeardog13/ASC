-- ============================================================================
-- ASC Tire Hotel — database schema for Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Run this ONCE in your Supabase project:
--   Supabase dashboard  ->  SQL Editor  ->  New query  ->  paste all  ->  Run
--
-- It creates the tables, an auto-generated set code (e.g. ASC-2026-0042),
-- search indexes, and Row Level Security so ONLY your logged-in shop account
-- can read or write the data.
-- ============================================================================

-- Unique, human-friendly code for each stored set: ASC-<year>-<counter>
create sequence if not exists set_code_seq;

-- ----------------------------------------------------------------------------
-- Customers (the tire owners)
-- ----------------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Vehicles (tires belong to a car)
-- ----------------------------------------------------------------------------
create table if not exists vehicles (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  make        text,
  model       text,
  year        int,
  plate       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Storage sets (the physical unit that gets ONE QR label)
-- ----------------------------------------------------------------------------
create table if not exists storage_sets (
  id               uuid primary key default gen_random_uuid(),
  public_code      text not null unique
                     default ('ASC-' || to_char(current_date, 'YYYY') || '-' ||
                              lpad(nextval('set_code_seq')::text, 4, '0')),
  vehicle_id       uuid references vehicles(id) on delete set null,
  season           text not null default 'winter',      -- winter | summer | all_season
  on_rims          boolean not null default false,
  rim_type         text,                                -- steel | alloy | null
  quantity         int not null default 4,
  -- Location / indexing (this is what the QR system points at)
  zone             text,
  rack             text,
  shelf            text,
  slot             text,
  -- Logistics
  check_in_date    date not null default current_date,
  expected_out_date date,
  fee              numeric(10,2),
  paid             boolean not null default false,
  status           text not null default 'in_storage',  -- in_storage | checked_out
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tires (the descriptive specs — 1 row per physical tire, usually 4 per set)
-- ----------------------------------------------------------------------------
create table if not exists tires (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references storage_sets(id) on delete cascade,
  position        text,           -- FL | FR | RL | RR | spare
  size            text,           -- e.g. 225/45R17 91V
  brand           text,
  model           text,
  tread_mm        numeric(4,1),   -- new ~8.0, legal minimum 1.6
  dot_code        text,           -- e.g. 2524 = week 25 of 2024
  studded         boolean not null default false,
  condition_notes text
);

-- ----------------------------------------------------------------------------
-- Search indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_sets_status   on storage_sets(status);
create index if not exists idx_sets_season   on storage_sets(season);
create index if not exists idx_sets_code     on storage_sets(public_code);
create index if not exists idx_vehicles_plate on vehicles(plate);
create index if not exists idx_tires_set     on tires(set_id);

-- ----------------------------------------------------------------------------
-- Keep updated_at fresh on every change to a set
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sets_updated on storage_sets;
create trigger trg_sets_updated
  before update on storage_sets
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security: only an authenticated (logged-in) user can touch data.
-- This app is single-tenant (one shop = one login), so any logged-in user
-- gets full access. The public "anon" key in the frontend can do NOTHING
-- until someone signs in.
-- ----------------------------------------------------------------------------
alter table customers    enable row level security;
alter table vehicles     enable row level security;
alter table storage_sets enable row level security;
alter table tires        enable row level security;

drop policy if exists "auth full access" on customers;
drop policy if exists "auth full access" on vehicles;
drop policy if exists "auth full access" on storage_sets;
drop policy if exists "auth full access" on tires;

create policy "auth full access" on customers
  for all to authenticated using (true) with check (true);
create policy "auth full access" on vehicles
  for all to authenticated using (true) with check (true);
create policy "auth full access" on storage_sets
  for all to authenticated using (true) with check (true);
create policy "auth full access" on tires
  for all to authenticated using (true) with check (true);

-- Done. Next: create ONE user in Authentication -> Users (that's the shop login).
