-- ============================================================================
-- ASC Tire Hotel — locations, movements, and placement RPCs
-- ----------------------------------------------------------------------------
-- ADDITIVE. Apply AFTER supabase/schema.sql (already applied by hand on
-- asc-tire-hotel). Do not drop or rewrite the free-text zone/rack/shelf/slot
-- columns. This file is the first recorded migration.
--
-- Order when going live:
--   1. this file
--   2. 20261014223100_revoke_asc_audit_and_fix_set_updated_at.sql
--   3. merge the app
-- Never run it from CI against the production project.
-- ============================================================================

-- Stable slot code. The same position always prints the same QR.
create or replace function public.location_qr(
  p_warehouse text,
  p_zone text,
  p_rack text,
  p_shelf text,
  p_slot text
) returns text
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select 'LOC-' || upper(substr(md5(
    lower(btrim(coalesce(p_warehouse, 'main'))) || '|' ||
    lower(btrim(coalesce(p_zone, ''))) || '|' ||
    lower(btrim(coalesce(p_rack, ''))) || '|' ||
    lower(btrim(coalesce(p_shelf, ''))) || '|' ||
    lower(btrim(coalesce(p_slot, '')))
  ), 1, 12));
$$;

create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  warehouse   text not null default 'main',
  zone        text not null default '',
  rack        text not null default '',
  shelf       text not null default '',
  slot        text not null default '',
  qr_code     text not null,
  status      text not null default 'free',
  created_at  timestamptz not null default now(),
  constraint locations_status_chk check (status in ('free', 'occupied', 'blocked')),
  constraint locations_position_uniq unique (warehouse, zone, rack, shelf, slot),
  constraint locations_qr_uniq unique (qr_code)
);

create table if not exists public.set_movements (
  id                bigint generated always as identity primary key,
  set_id            uuid not null references public.storage_sets(id) on delete cascade,
  from_location_id  uuid references public.locations(id) on delete set null,
  to_location_id    uuid references public.locations(id) on delete set null,
  action            text not null,
  actor             uuid,
  created_at        timestamptz not null default now(),
  constraint set_movements_action_chk check (action in ('in', 'move', 'out'))
);

create index if not exists idx_locations_free
  on public.locations (warehouse, zone, rack, shelf, slot)
  where status = 'free';

create index if not exists idx_movements_set
  on public.set_movements (set_id, created_at desc);

create index if not exists idx_movements_to
  on public.set_movements (to_location_id, created_at desc);

alter table public.storage_sets
  add column if not exists location_id uuid references public.locations(id) on delete set null;

-- One live set per slot. Checked-out and soft-deleted rows release the slot.
create unique index if not exists uniq_storage_sets_live_location
  on public.storage_sets (location_id)
  where location_id is not null
    and deleted_at is null
    and status in ('in_storage', 'reserved');

create index if not exists idx_sets_location_id
  on public.storage_sets (location_id)
  where location_id is not null;

-- Fill a missing QR before the NOT NULL check, and keep position parts comparable.
create or replace function public.locations_fill_qr()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.warehouse := coalesce(nullif(btrim(new.warehouse), ''), 'main');
  new.zone := coalesce(btrim(new.zone), '');
  new.rack := coalesce(btrim(new.rack), '');
  new.shelf := coalesce(btrim(new.shelf), '');
  new.slot := coalesce(btrim(new.slot), '');
  if new.qr_code is null or btrim(new.qr_code) = '' then
    new.qr_code := public.location_qr(new.warehouse, new.zone, new.rack, new.shelf, new.slot);
  else
    new.qr_code := upper(btrim(new.qr_code));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_locations_fill_qr on public.locations;
create trigger trg_locations_fill_qr
  before insert or update of warehouse, zone, rack, shelf, slot, qr_code
  on public.locations
  for each row execute function public.locations_fill_qr();

-- Status must agree with whether a live set is linked. Blocks a direct write
-- that would mark a full slot free, or an empty slot occupied.
create or replace function public.locations_status_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_live boolean;
begin
  select exists (
    select 1 from public.storage_sets s
     where s.location_id = new.id
       and s.deleted_at is null
       and s.status in ('in_storage', 'reserved')
  ) into v_live;
  if new.status = 'occupied' and not v_live then
    raise exception 'A slot is occupied only while a stored set is linked to it.';
  end if;
  if new.status = 'free' and v_live then
    raise exception 'This slot still has a stored set.';
  end if;
  if new.status = 'blocked' and v_live then
    raise exception 'Move the set before blocking this slot.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_locations_status_guard on public.locations;
create trigger trg_locations_status_guard
  before insert or update of status on public.locations
  for each row execute function public.locations_status_guard();

-- ----------------------------------------------------------------------------
-- Backfill from the existing text fields. Text columns stay as they are.
-- When two live sets share one position, the newest keeps the slot. The other
-- keeps its text location and a null location_id so the unique slot holds.
-- No synthetic movement rows: we do not invent a scan that did not happen.
-- ----------------------------------------------------------------------------
insert into public.locations (warehouse, zone, rack, shelf, slot, qr_code, status)
select distinct
  'main',
  coalesce(nullif(btrim(s.zone), ''), ''),
  coalesce(nullif(btrim(s.rack), ''), ''),
  coalesce(nullif(btrim(s.shelf), ''), ''),
  coalesce(nullif(btrim(s.slot), ''), ''),
  public.location_qr(
    'main',
    coalesce(nullif(btrim(s.zone), ''), ''),
    coalesce(nullif(btrim(s.rack), ''), ''),
    coalesce(nullif(btrim(s.shelf), ''), ''),
    coalesce(nullif(btrim(s.slot), ''), '')
  ),
  'free'
from public.storage_sets s
where s.deleted_at is null
  and s.status in ('in_storage', 'reserved')
  and (
    nullif(btrim(s.zone), '') is not null
    or nullif(btrim(s.rack), '') is not null
    or nullif(btrim(s.shelf), '') is not null
    or nullif(btrim(s.slot), '') is not null
  )
on conflict (warehouse, zone, rack, shelf, slot) do nothing;

with ranked as (
  select
    s.id as set_id,
    l.id as location_id,
    row_number() over (
      partition by l.id
      order by s.updated_at desc nulls last, s.created_at desc nulls last, s.id
    ) as rn
  from public.storage_sets s
  join public.locations l
    on l.warehouse = 'main'
   and l.zone = coalesce(nullif(btrim(s.zone), ''), '')
   and l.rack = coalesce(nullif(btrim(s.rack), ''), '')
   and l.shelf = coalesce(nullif(btrim(s.shelf), ''), '')
   and l.slot = coalesce(nullif(btrim(s.slot), ''), '')
  where s.deleted_at is null
    and s.status in ('in_storage', 'reserved')
    and s.location_id is null
)
update public.storage_sets s
   set location_id = ranked.location_id
  from ranked
 where s.id = ranked.set_id
   and ranked.rn = 1
   and s.location_id is null;

-- The status guard requires the set link to exist before status becomes occupied.
update public.locations l
   set status = 'occupied'
 where l.status = 'free'
   and exists (
     select 1 from public.storage_sets s
      where s.location_id = l.id
        and s.deleted_at is null
        and s.status in ('in_storage', 'reserved')
   );

-- ----------------------------------------------------------------------------
-- RLS. Staff read and write locations. Movements are append-only.
-- Audit inserts are allowed for staff so SECURITY INVOKER RPCs can write
-- audit_events in the same transaction. No update or delete on the log.
-- ----------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.set_movements enable row level security;

drop policy if exists "locations_select" on public.locations;
drop policy if exists "locations_insert" on public.locations;
drop policy if exists "locations_update" on public.locations;
drop policy if exists "locations_delete" on public.locations;
create policy "locations_select" on public.locations
  for select to authenticated using (public.asc_role() <> 'readonly');
create policy "locations_insert" on public.locations
  for insert to authenticated
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "locations_update" on public.locations
  for update to authenticated
  using (public.asc_role() in ('admin', 'manager', 'employee', 'reception'))
  with check (public.asc_role() in ('admin', 'manager', 'employee', 'reception'));
create policy "locations_delete" on public.locations
  for delete to authenticated using (public.asc_is_admin());

drop policy if exists "movements_select" on public.set_movements;
drop policy if exists "movements_insert" on public.set_movements;
create policy "movements_select" on public.set_movements
  for select to authenticated using (public.asc_role() <> 'readonly');
create policy "movements_insert" on public.set_movements
  for insert to authenticated
  with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and actor is not distinct from auth.uid()
  );

drop policy if exists "audit_insert" on public.audit_events;
create policy "audit_insert" on public.audit_events
  for insert to authenticated
  with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and actor is not distinct from auth.uid()
  );

revoke all on table public.locations from public, anon;
revoke all on table public.set_movements from public, anon;
grant select, insert, update, delete on table public.locations to authenticated;
grant select, insert on table public.set_movements to authenticated;
grant usage, select on sequence public.set_movements_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'locations'
  ) then
    execute 'alter publication supabase_realtime add table public.locations';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'set_movements'
  ) then
    execute 'alter publication supabase_realtime add table public.set_movements';
  end if;
exception when others then
  raise notice 'realtime add locations/set_movements skipped: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- Shared helpers used by the placement RPCs. SECURITY INVOKER: RLS applies.
-- ----------------------------------------------------------------------------
create or replace function public.asc_require_staff()
returns void
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if public.asc_role() not in ('admin', 'manager', 'employee', 'reception') then
    raise exception 'You do not have permission.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.asc_location_json(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case when p_id is null then null else jsonb_build_object(
    'id', l.id,
    'warehouse', l.warehouse,
    'zone', nullif(l.zone, ''),
    'rack', nullif(l.rack, ''),
    'shelf', nullif(l.shelf, ''),
    'slot', nullif(l.slot, ''),
    'qr_code', l.qr_code,
    'status', l.status
  ) end
  from public.locations l
  where l.id = p_id;
$$;

create or replace function public.asc_lock_set(
  p_set_id uuid,
  p_public_code text
) returns public.storage_sets
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v public.storage_sets;
  v_code text := nullif(upper(btrim(coalesce(p_public_code, ''))), '');
begin
  if p_set_id is not null then
    select * into v from public.storage_sets where id = p_set_id for update;
  elsif v_code is not null then
    select * into v from public.storage_sets where public_code = v_code for update;
  else
    raise exception 'A set id or code is required.';
  end if;
  if not found then
    raise exception 'That tire set was not found.';
  end if;
  if v.deleted_at is not null then
    raise exception 'That tire set is in the recycle bin.';
  end if;
  return v;
end;
$$;

create or replace function public.asc_lock_location(
  p_location_id uuid,
  p_qr_code text
) returns public.locations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v public.locations;
  v_qr text := nullif(upper(btrim(coalesce(p_qr_code, ''))), '');
begin
  if p_location_id is not null then
    select * into v from public.locations where id = p_location_id for update;
  elsif v_qr is not null then
    select * into v from public.locations where qr_code = v_qr for update;
  else
    raise exception 'Scan a slot label or pick a free slot.';
  end if;
  if not found then
    raise exception 'That slot was not found. Create it under Mjesta, then scan its label.';
  end if;
  return v;
end;
$$;

create or replace function public.asc_write_movement(
  p_set_id uuid,
  p_from uuid,
  p_to uuid,
  p_action text
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.set_movements (set_id, from_location_id, to_location_id, action, actor)
  values (p_set_id, p_from, p_to, p_action, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.asc_write_audit(
  p_set public.storage_sets,
  p_action text,
  p_summary text,
  p_changes jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events (actor, actor_email, entity_type, entity_id, set_code, action, summary, changes)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    'storage_sets',
    p_set.id,
    p_set.public_code,
    p_action,
    p_summary,
    coalesce(p_changes, '{}'::jsonb)
  );
end;
$$;

create or replace function public.asc_sync_set_location(
  p_set_id uuid,
  p_loc public.locations
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Keep the original text fields in step with the slot so older screens
  -- still show where the tires are.
  update public.storage_sets
     set location_id = p_loc.id,
         zone = nullif(p_loc.zone, ''),
         rack = nullif(p_loc.rack, ''),
         shelf = nullif(p_loc.shelf, ''),
         slot = nullif(p_loc.slot, '')
   where id = p_set_id;
end;
$$;

create or replace function public.asc_mark_occupied(p_location_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.locations
     set status = 'occupied'
   where id = p_location_id
     and status is distinct from 'occupied';
end;
$$;

create or replace function public.asc_mark_free(p_location_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_location_id is null then
    return;
  end if;
  update public.locations l
     set status = 'free'
   where l.id = p_location_id
     and l.status <> 'blocked'
     and not exists (
       select 1 from public.storage_sets s
        where s.location_id = l.id
          and s.deleted_at is null
          and s.status in ('in_storage', 'reserved')
     );
end;
$$;

create or replace function public.place_set(
  set_id uuid default null,
  public_code text default null,
  location_id uuid default null,
  qr_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_set public.storage_sets;
  v_loc public.locations;
  v_other text;
  v_move bigint;
begin
  perform public.asc_require_staff();
  v_set := public.asc_lock_set(set_id, public_code);
  if v_set.status not in ('in_storage', 'reserved') then
    raise exception 'Only a stored set can be placed. This one is %.', v_set.status;
  end if;
  v_loc := public.asc_lock_location(location_id, qr_code);

  if v_set.location_id is not distinct from v_loc.id then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'public_code', v_set.public_code,
      'location', public.asc_location_json(v_loc.id)
    );
  end if;
  if v_set.location_id is not null then
    raise exception 'This set is already in a slot. Scan a move instead.';
  end if;
  if v_loc.status = 'blocked' then
    raise exception 'That slot is blocked.';
  end if;

  select s.public_code into v_other
    from public.storage_sets s
   where s.location_id = v_loc.id
     and s.id <> v_set.id
     and s.deleted_at is null
     and s.status in ('in_storage', 'reserved')
   limit 1;
  if v_other is not null then
    raise exception 'That slot already holds %.', v_other;
  end if;

  perform public.asc_sync_set_location(v_set.id, v_loc);
  perform public.asc_mark_occupied(v_loc.id);
  v_move := public.asc_write_movement(v_set.id, null, v_loc.id, 'in');
  perform public.asc_write_audit(
    v_set,
    'placed',
    'Placed in ' || v_loc.qr_code,
    jsonb_build_object('to', public.asc_location_json(v_loc.id), 'movement_id', v_move)
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'in',
    'movement_id', v_move,
    'public_code', v_set.public_code,
    'location', public.asc_location_json(v_loc.id)
  );
end;
$$;

create or replace function public.move_set(
  set_id uuid default null,
  public_code text default null,
  location_id uuid default null,
  qr_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_set public.storage_sets;
  v_from public.locations;
  v_to public.locations;
  v_other text;
  v_move bigint;
  v_first uuid;
  v_second uuid;
  v_qr text;
begin
  perform public.asc_require_staff();
  v_set := public.asc_lock_set(set_id, public_code);
  v_qr := nullif(upper(btrim(coalesce(qr_code, ''))), '');
  if v_set.status not in ('in_storage', 'reserved') then
    raise exception 'Only a stored set can be moved. This one is %.', v_set.status;
  end if;

  -- Lock slot rows in id order so two moves cannot deadlock.
  if v_set.location_id is not null then
    select id into v_first from public.locations where id = v_set.location_id;
  end if;
  if location_id is not null then
    v_second := location_id;
  elsif v_qr is not null then
    select l.id into v_second from public.locations l where l.qr_code = v_qr;
    if v_second is null then
      raise exception 'That slot was not found. Create it under Mjesta, then scan its label.';
    end if;
  else
    raise exception 'Scan the destination slot label.';
  end if;

  if v_first is not null and v_second is not null and v_first > v_second then
    perform 1 from public.locations where id = v_second for update;
    perform 1 from public.locations where id = v_first for update;
  else
    if v_first is not null then
      perform 1 from public.locations where id = v_first for update;
    end if;
    perform 1 from public.locations where id = v_second for update;
  end if;

  if v_set.location_id is not null then
    select * into v_from from public.locations where id = v_set.location_id;
  end if;
  select * into v_to from public.locations where id = v_second;
  if not found then
    raise exception 'That slot was not found. Create it under Mjesta, then scan its label.';
  end if;

  if v_set.location_id is not distinct from v_to.id then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'public_code', v_set.public_code,
      'location', public.asc_location_json(v_to.id)
    );
  end if;
  if v_to.status = 'blocked' then
    raise exception 'That slot is blocked.';
  end if;
  select s.public_code into v_other
    from public.storage_sets s
   where s.location_id = v_to.id
     and s.id <> v_set.id
     and s.deleted_at is null
     and s.status in ('in_storage', 'reserved')
   limit 1;
  if v_other is not null then
    raise exception 'That slot already holds %.', v_other;
  end if;

  -- Clear the old link first so the unique index and the status guard agree.
  update public.storage_sets set location_id = null where id = v_set.id;
  perform public.asc_mark_free(v_from.id);
  perform public.asc_sync_set_location(v_set.id, v_to);
  perform public.asc_mark_occupied(v_to.id);
  v_move := public.asc_write_movement(
    v_set.id, v_from.id, v_to.id,
    case when v_from.id is null then 'in' else 'move' end
  );
  perform public.asc_write_audit(
    v_set,
    case when v_from.id is null then 'placed' else 'moved' end,
    case when v_from.id is null then 'Placed in ' else 'Moved to ' end || v_to.qr_code,
    jsonb_build_object(
      'from', public.asc_location_json(v_from.id),
      'to', public.asc_location_json(v_to.id),
      'movement_id', v_move
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'move',
    'movement_id', v_move,
    'public_code', v_set.public_code,
    'location', public.asc_location_json(v_to.id)
  );
end;
$$;

create or replace function public.checkout_set(
  set_id uuid default null,
  public_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_set public.storage_sets;
  v_from uuid;
  v_move bigint;
begin
  perform public.asc_require_staff();
  v_set := public.asc_lock_set(set_id, public_code);
  v_from := v_set.location_id;

  if v_set.status = 'checked_out' and v_from is null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'public_code', v_set.public_code,
      'location', null
    );
  end if;

  if v_from is not null then
    perform 1 from public.locations where id = v_from for update;
  end if;

  -- Drop the link before freeing the slot. Text fields stay as the last place.
  update public.storage_sets
     set location_id = null,
         status = 'checked_out',
         picked_up_at = coalesce(picked_up_at, now())
   where id = v_set.id;

  perform public.asc_mark_free(v_from);
  v_move := public.asc_write_movement(v_set.id, v_from, null, 'out');
  perform public.asc_write_audit(
    v_set,
    'checked_out',
    'Checked out' || case when v_from is null then '' else ' — slot freed' end,
    jsonb_build_object(
      'from', public.asc_location_json(v_from),
      'movement_id', v_move
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'out',
    'movement_id', v_move,
    'public_code', v_set.public_code,
    'freed_location_id', v_from
  );
end;
$$;

create or replace function public.suggest_free_slot(
  warehouse text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v public.locations;
  v_warehouse text := nullif(btrim(coalesce(warehouse, '')), '');
begin
  perform public.asc_require_staff();
  select * into v
    from public.locations l
   where l.status = 'free'
     and (v_warehouse is null or l.warehouse = v_warehouse)
     and not exists (
       select 1 from public.storage_sets s
        where s.location_id = l.id
          and s.deleted_at is null
          and s.status in ('in_storage', 'reserved')
     )
   order by l.warehouse, l.zone, l.rack, l.shelf, l.slot
   limit 1;
  if not found then
    return null;
  end if;
  return public.asc_location_json(v.id);
end;
$$;

-- Anon and PUBLIC cannot call these. Authenticated can, because the RPCs are
-- SECURITY INVOKER: the signed-in user is the one executing every helper.
-- Row level security and the status guard still apply to direct calls.
revoke all on function public.location_qr(text, text, text, text, text) from public, anon;
revoke all on function public.locations_fill_qr() from public, anon;
revoke all on function public.locations_status_guard() from public, anon;
revoke all on function public.asc_require_staff() from public, anon;
revoke all on function public.asc_location_json(uuid) from public, anon;
revoke all on function public.asc_lock_set(uuid, text) from public, anon;
revoke all on function public.asc_lock_location(uuid, text) from public, anon;
revoke all on function public.asc_write_movement(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.asc_write_audit(public.storage_sets, text, text, jsonb) from public, anon;
revoke all on function public.asc_sync_set_location(uuid, public.locations) from public, anon;
revoke all on function public.asc_mark_occupied(uuid) from public, anon;
revoke all on function public.asc_mark_free(uuid) from public, anon;
revoke all on function public.place_set(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.move_set(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.checkout_set(uuid, text) from public, anon, authenticated;
revoke all on function public.suggest_free_slot(text) from public, anon, authenticated;

grant execute on function public.location_qr(text, text, text, text, text) to authenticated;
grant execute on function public.locations_fill_qr() to authenticated;
grant execute on function public.locations_status_guard() to authenticated;
grant execute on function public.asc_require_staff() to authenticated;
grant execute on function public.asc_location_json(uuid) to authenticated;
grant execute on function public.asc_lock_set(uuid, text) to authenticated;
grant execute on function public.asc_lock_location(uuid, text) to authenticated;
grant execute on function public.asc_write_movement(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.asc_write_audit(public.storage_sets, text, text, jsonb) to authenticated;
grant execute on function public.asc_sync_set_location(uuid, public.locations) to authenticated;
grant execute on function public.asc_mark_occupied(uuid) to authenticated;
grant execute on function public.asc_mark_free(uuid) to authenticated;
grant execute on function public.place_set(uuid, text, uuid, text) to authenticated;
grant execute on function public.move_set(uuid, text, uuid, text) to authenticated;
grant execute on function public.checkout_set(uuid, text) to authenticated;
grant execute on function public.suggest_free_slot(text) to authenticated;
