-- ============================================================================
-- ASC Tire Hotel — shared warehouse map: operator areas + rack positions
-- NEEDS TONI'S APPROVAL TO APPLY. Not applied to any live database.
-- Additive only: two new tables, no change to locations, customers,
-- storage_sets or tires, and no foreign keys or cascades into them.
-- Sizes are operator-entered; unit 'grid' = relative squares (not measured),
-- unit 'm' = measured in metres by the operator. Nothing is pre-seeded.
-- Zone/rack values are stored normalised (NFC, trimmed, single spaces, upper
-- case) by the app, matching how the map compares them to locations.
-- ============================================================================

create table if not exists public.warehouse_areas (
  id          uuid primary key default gen_random_uuid(),
  warehouse   text not null default 'main',
  zone        text not null,
  name        text not null,
  width       numeric not null,
  depth       numeric not null,
  unit        text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint warehouse_areas_zone_uniq unique (warehouse, zone),
  constraint warehouse_areas_zone_len check (char_length(zone) between 1 and 40),
  constraint warehouse_areas_name_len check (char_length(name) between 1 and 60),
  constraint warehouse_areas_width_chk check (width > 0 and width <= 200),
  constraint warehouse_areas_depth_chk check (depth > 0 and depth <= 200),
  constraint warehouse_areas_unit_chk check (unit in ('m', 'grid'))
);

-- A rack position is where the operator put a real rack (locations.rack) on
-- the area's floor. Deleting an area with positions is refused (restrict).
create table if not exists public.warehouse_rack_positions (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.warehouse_areas(id) on delete restrict,
  rack        text not null,
  x           numeric not null,
  z           numeric not null,
  capacity    integer not null default 8,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint warehouse_rack_positions_uniq unique (area_id, rack),
  constraint warehouse_rack_positions_rack_len check (char_length(rack) between 1 and 40),
  constraint warehouse_rack_positions_xz_chk check (abs(x) <= 100 and abs(z) <= 100),
  constraint warehouse_rack_positions_capacity_chk check (capacity between 1 and 16)
);

create index if not exists idx_rack_positions_area on public.warehouse_rack_positions (area_id);

drop trigger if exists trg_warehouse_areas_updated on public.warehouse_areas;
create trigger trg_warehouse_areas_updated before update on public.warehouse_areas
  for each row execute function public.set_updated_at();
drop trigger if exists trg_rack_positions_updated on public.warehouse_rack_positions;
create trigger trg_rack_positions_updated before update on public.warehouse_rack_positions
  for each row execute function public.set_updated_at();

-- RLS mirrors locations: staff read; staff/admin write (locations_insert roles).
alter table public.warehouse_areas enable row level security;
alter table public.warehouse_rack_positions enable row level security;

drop policy if exists "warehouse_areas_select" on public.warehouse_areas;
drop policy if exists "warehouse_areas_insert" on public.warehouse_areas;
drop policy if exists "warehouse_areas_update" on public.warehouse_areas;
drop policy if exists "warehouse_areas_delete" on public.warehouse_areas;
create policy "warehouse_areas_select" on public.warehouse_areas
  for select to authenticated using (public.asc_role() <> 'readonly');
create policy "warehouse_areas_insert" on public.warehouse_areas
  for insert to authenticated
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "warehouse_areas_update" on public.warehouse_areas
  for update to authenticated
  using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'))
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "warehouse_areas_delete" on public.warehouse_areas
  for delete to authenticated
  using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));

drop policy if exists "rack_positions_select" on public.warehouse_rack_positions;
drop policy if exists "rack_positions_insert" on public.warehouse_rack_positions;
drop policy if exists "rack_positions_update" on public.warehouse_rack_positions;
drop policy if exists "rack_positions_delete" on public.warehouse_rack_positions;
create policy "rack_positions_select" on public.warehouse_rack_positions
  for select to authenticated using (public.asc_role() <> 'readonly');
create policy "rack_positions_insert" on public.warehouse_rack_positions
  for insert to authenticated
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "rack_positions_update" on public.warehouse_rack_positions
  for update to authenticated
  using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'))
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "rack_positions_delete" on public.warehouse_rack_positions
  for delete to authenticated
  using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));

revoke all on table public.warehouse_areas from public, anon;
revoke all on table public.warehouse_rack_positions from public, anon;
grant select, insert, update, delete on table public.warehouse_areas to authenticated;
grant select, insert, update, delete on table public.warehouse_rack_positions to authenticated;
