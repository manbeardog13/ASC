-- ASC physical building spaces -> existing operator warehouse areas.
-- NEEDS TONI'S EXPLICIT APPROVAL BEFORE PRODUCTION APPLICATION.
-- Additive only: no seeded bindings and no inventory/customer/location writes.
-- Deleting an area removes only its binding; no operational table is referenced.

create table if not exists public.warehouse_space_bindings (
  warehouse text not null default 'main',
  space_id text not null,
  area_id uuid not null references public.warehouse_areas(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_space_bindings_pkey primary key (warehouse, space_id),
  constraint warehouse_space_bindings_area_uniq unique (warehouse, area_id),
  constraint warehouse_space_bindings_warehouse_chk check (char_length(btrim(warehouse)) > 0),
  constraint warehouse_space_bindings_space_chk check (space_id in (
    'house-ground', 'house-platform', 'house-attic', 'attic-parts', 'attic-racks', 'triangular-store'
  ))
);

create index if not exists idx_warehouse_space_bindings_area on public.warehouse_space_bindings(area_id);
alter table public.warehouse_space_bindings enable row level security;
revoke all on table public.warehouse_space_bindings from public, anon, authenticated;
grant select, insert, update, delete on table public.warehouse_space_bindings to authenticated;

drop policy if exists warehouse_space_bindings_select on public.warehouse_space_bindings;
drop policy if exists warehouse_space_bindings_insert on public.warehouse_space_bindings;
drop policy if exists warehouse_space_bindings_update on public.warehouse_space_bindings;
drop policy if exists warehouse_space_bindings_delete on public.warehouse_space_bindings;
create policy warehouse_space_bindings_select on public.warehouse_space_bindings
  for select to authenticated using (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (select 1 from public.warehouse_areas a where a.id = area_id and a.warehouse = warehouse_space_bindings.warehouse)
  );
create policy warehouse_space_bindings_insert on public.warehouse_space_bindings
  for insert to authenticated with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (select 1 from public.warehouse_areas a where a.id = area_id and a.warehouse = warehouse_space_bindings.warehouse)
  );
create policy warehouse_space_bindings_update on public.warehouse_space_bindings
  for update to authenticated using (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (select 1 from public.warehouse_areas a where a.id = area_id and a.warehouse = warehouse_space_bindings.warehouse)
  ) with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (select 1 from public.warehouse_areas a where a.id = area_id and a.warehouse = warehouse_space_bindings.warehouse)
  );
create policy warehouse_space_bindings_delete on public.warehouse_space_bindings
  for delete to authenticated using (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (select 1 from public.warehouse_areas a where a.id = area_id and a.warehouse = warehouse_space_bindings.warehouse)
  );

create or replace function public.validate_warehouse_space_binding() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(public.asc_role(), '') not in ('admin', 'manager', 'employee', 'reception') then
    raise insufficient_privilege using message = 'Only staff can edit building bindings';
  end if;
  -- Reads through the caller's RLS. The FK locks the parent against deletion;
  -- warehouse_areas already prohibits changing a parent's warehouse or zone.
  if not exists (select 1 from public.warehouse_areas a where a.id = new.area_id and a.warehouse = new.warehouse) then
    raise check_violation using message = 'Binding must use an existing area in the same warehouse';
  end if;
  if tg_op = 'UPDATE' then
    if new.warehouse is distinct from old.warehouse or new.space_id is distinct from old.space_id then
      raise check_violation using message = 'Remove the old binding before changing its building space';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.validate_warehouse_space_binding() from public, anon, authenticated;
drop trigger if exists trg_validate_warehouse_space_binding on public.warehouse_space_bindings;
create trigger trg_validate_warehouse_space_binding before insert or update on public.warehouse_space_bindings
  for each row execute function public.validate_warehouse_space_binding();
