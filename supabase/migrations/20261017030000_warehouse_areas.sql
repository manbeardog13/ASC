-- ============================================================================
-- ASC Tire Hotel — shared warehouse map: operator areas + rack positions
-- NEEDS TONI'S APPROVAL TO APPLY. Not applied to any live database.
-- Additive only: two new tables, no change to locations, customers,
-- storage_sets or tires, and no foreign keys or cascades into them.
-- Sizes are operator-entered; unit 'grid' = relative squares (not measured),
-- unit 'm' = measured in metres by the operator. Nothing is pre-seeded.
-- Zone/rack values are stored normalised (NFC, trimmed, single spaces, upper
-- case) at the database boundary as well as in the app. All validation reads
-- operational rows through the caller's RLS; it never changes those rows.
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
  for select to authenticated using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
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
  for select to authenticated using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
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

-- Remove inherited/default TRUNCATE too: RLS does not protect that operation.
revoke all on table public.warehouse_areas from public, anon, authenticated;
revoke all on table public.warehouse_rack_positions from public, anon, authenticated;
grant select, insert, update, delete on table public.warehouse_areas to authenticated;
grant select, insert, update, delete on table public.warehouse_rack_positions to authenticated;

create or replace function public.warehouse_location_key(value text) returns text
language sql immutable parallel safe security invoker set search_path = '' as $$
  select upper(btrim(regexp_replace(normalize(coalesce(value, ''), NFC), '[[:space:]]+', ' ', 'g')));
$$;
revoke all on function public.warehouse_location_key(text) from public, anon;
grant execute on function public.warehouse_location_key(text) to authenticated;

create or replace function public.validate_warehouse_area() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if public.asc_role() not in ('admin', 'manager', 'employee', 'reception') then
    raise insufficient_privilege using message = 'Only staff can edit warehouse areas';
  end if;
  new.zone := public.warehouse_location_key(new.zone);
  if new.zone !~ '^[[:alnum:]][[:alnum:] ._/-]*$' then
    raise check_violation using message = 'Invalid zone label';
  end if;
  if not exists (select 1 from public.locations l where l.warehouse = new.warehouse
      and public.warehouse_location_key(l.zone) = new.zone) then
    raise check_violation using message = 'Warehouse zone must exist in locations';
  end if;
  if tg_op = 'UPDATE' then
    -- Rebinding an area would silently relabel every rack below it.
    if new.warehouse is distinct from old.warehouse or new.zone is distinct from old.zone then
      raise check_violation using message = 'Create a new area to change its location binding';
    end if;
    if exists (select 1 from public.warehouse_rack_positions p where p.area_id = old.id
        and (abs(p.x) + 0.27 > new.width / 2 or abs(p.z) + 0.27 > new.depth / 2)) then
      raise check_violation using message = 'Area must contain all rack positions';
    end if;
    new.created_by := old.created_by;
  else
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create or replace function public.validate_warehouse_rack_position() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare a public.warehouse_areas;
begin
  if public.asc_role() not in ('admin', 'manager', 'employee', 'reception') then
    raise insufficient_privilege using message = 'Only staff can edit rack positions';
  end if;
  -- Serialize placements in one area so concurrent writers cannot overlap racks.
  select * into a from public.warehouse_areas where id = new.area_id for update;
  if not found then raise foreign_key_violation using message = 'Warehouse area unavailable'; end if;
  new.rack := public.warehouse_location_key(new.rack);
  if new.rack !~ '^[[:alnum:]][[:alnum:] ._/-]*$' then
    raise check_violation using message = 'Invalid rack label';
  end if;
  if not exists (select 1 from public.locations l where l.warehouse = a.warehouse
      and public.warehouse_location_key(l.zone) = a.zone
      and public.warehouse_location_key(l.rack) = new.rack) then
    raise check_violation using message = 'Rack must exist in this warehouse zone';
  end if;
  if abs(new.x) + 0.27 > a.width / 2 or abs(new.z) + 0.27 > a.depth / 2 then
    raise check_violation using message = 'Rack position must fit inside its area';
  end if;
  if exists (select 1 from public.warehouse_rack_positions p where p.area_id = new.area_id
      and p.id <> new.id and p.rack <> new.rack
      and (p.x-new.x)^2 + (p.z-new.z)^2 < 0.54^2) then
    raise check_violation using message = 'Rack positions must not overlap';
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by;
  else new.created_by := auth.uid(); end if;
  return new;
end $$;

revoke all on function public.validate_warehouse_area() from public, anon, authenticated;
revoke all on function public.validate_warehouse_rack_position() from public, anon, authenticated;
drop trigger if exists trg_validate_warehouse_area on public.warehouse_areas;
create trigger trg_validate_warehouse_area before insert or update on public.warehouse_areas
  for each row execute function public.validate_warehouse_area();
drop trigger if exists trg_validate_warehouse_rack on public.warehouse_rack_positions;
create trigger trg_validate_warehouse_rack before insert or update on public.warehouse_rack_positions
  for each row execute function public.validate_warehouse_rack_position();
