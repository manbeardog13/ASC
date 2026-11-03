-- Authorized operational bootstrap: six empty logical areas, no invented slots or inventory.
-- Grid units preserve the reviewed schematic dimensions; physical junction remains unconfirmed.
-- SECURITY INVOKER: postgres may provision metadata; browser roles still require staff RLS.
create or replace function public.validate_warehouse_area() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' and coalesce(public.asc_role(), '') not in ('admin', 'manager', 'employee', 'reception') then
    raise insufficient_privilege using message = 'Only staff can edit warehouse areas';
  end if;
  new.zone := public.warehouse_location_key(new.zone);
  if new.zone !~ '^[[:alnum:]][[:alnum:] ._/-]*$' then
    raise check_violation using message = 'Invalid zone label';
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

create or replace function public.validate_warehouse_space_binding() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'postgres' and coalesce(public.asc_role(), '') not in ('admin', 'manager', 'employee', 'reception') then
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


-- Do not infer an existing area's physical identity from its zone label alone.
-- A matching existing binding is safe to replay. Any collision requires review.
do $$ begin
  lock table public.warehouse_areas, public.warehouse_space_bindings in share row exclusive mode;
  if exists (
    select 1 from (values
      ('2.1','house-ground'),('2.2','house-platform'),('2.3','house-attic'),
      ('POLICE','attic-parts'),('REGALI','attic-racks'),('TROKUT','triangular-store')
    ) v(zone,space_id)
    left join public.warehouse_areas a on a.warehouse='main' and a.zone=v.zone
    left join public.warehouse_space_bindings b on b.warehouse='main' and b.space_id=v.space_id
    where a.id is distinct from b.area_id
  ) then raise exception 'Existing zone or physical room is already in use. Check its binding before provisioning.'; end if;
insert into public.warehouse_areas (warehouse,zone,name,width,depth,unit) values
 ('main','2.1','Kuća · prizemlje',10,14,'grid'),
 ('main','2.2','Kuća · drvena platforma',10,14,'grid'),
 ('main','2.3','Kuća · potkrovlje',10,14,'grid'),
 ('main','POLICE','Potkrovlje · bijele police',12,32,'grid'),
 ('main','REGALI','Potkrovlje · regali i platforma',10,32,'grid'),
 ('main','TROKUT','Trokutasto spremište',5,7,'grid')
on conflict (warehouse,zone) do nothing;
insert into public.warehouse_space_bindings(warehouse,space_id,area_id)
select a.warehouse,v.space_id,a.id from (values
 ('2.1','house-ground'),('2.2','house-platform'),('2.3','house-attic'),
 ('POLICE','attic-parts'),('REGALI','attic-racks'),('TROKUT','triangular-store')
) as v(zone,space_id) join public.warehouse_areas a on a.warehouse='main' and a.zone=v.zone
on conflict do nothing;
end $$;

-- The same permission-checked rows can notify connected clients. Installations
-- without Supabase Realtime use the app's polling fallback.
do $$ declare relation_name text; begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach relation_name in array array['warehouse_areas','warehouse_rack_positions','warehouse_space_bindings'] loop
      if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime'
                    and schemaname='public' and tablename=relation_name) then
        execute format('alter publication supabase_realtime add table public.%I',relation_name);
      end if;
    end loop;
  end if;
end $$;
