-- Keep recycle/restore/permanent-delete and placement in the same transaction
-- as their slot occupancy. No role, RLS, CRUD grant, or owner changes.
begin;

-- Brief write gate for trigger installation and existing-status reconciliation.
-- NOWAIT fails safely on a busy warehouse instead of waiting in a lock cycle.
-- Retry the complete migration during a quiet write interval after review.
lock table public.storage_sets, public.locations in exclusive mode nowait;

create or replace function public.asc_sync_slot_occupancy()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old uuid;
  v_new uuid;
  v_id uuid;
  v_status text;
  v_live boolean;
begin
  if tg_op <> 'INSERT' then v_old := old.location_id; end if;
  if tg_op <> 'DELETE' then v_new := new.location_id; end if;

  if tg_when = 'BEFORE' then
    -- The RPCs lock the set first, then slots in UUID order. A direct set write
    -- already owns its row lock and takes the same slot-lock order here, BEFORE
    -- changing the partial unique index. Do not move this lock to AFTER only.
    perform 1 from public.locations l
     where l.id = any(array[v_old, v_new])
     order by l.id
     for update;

    if tg_op <> 'DELETE' and v_new is not null
       and new.deleted_at is null
       and new.status in ('in_storage', 'reserved') then
      select l.status into v_status from public.locations l where l.id = v_new;
      if not found then
        raise exception 'That slot was not found.' using errcode = '23503';
      end if;
      if v_status = 'blocked' then
        raise exception 'That slot is blocked. Choose another slot before restoring this set.'
          using errcode = '23514';
      end if;
      if exists (
        select 1 from public.storage_sets s
         where s.location_id = v_new and s.id <> new.id
           and s.deleted_at is null and s.status in ('in_storage', 'reserved')
      ) then
        raise exception 'That slot already holds another set. Choose another slot before restoring this set.'
          using errcode = '23505';
      end if;
    end if;
  else
    -- BEFORE holds the slot locks until commit. Recompute from actual linked
    -- sets; do not invent a scan/movement row for a recycle-bin action.
    for v_id in
      select distinct x from unnest(array[v_old, v_new]) as u(x)
       where x is not null order by x
    loop
      select exists (
        select 1 from public.storage_sets s
         where s.location_id = v_id and s.deleted_at is null
           and s.status in ('in_storage', 'reserved')
      ) into v_live;
      v_status := case when v_live then 'occupied' else 'free' end;
      update public.locations l set status = v_status
       where l.id = v_id and l.status <> 'blocked'
         and l.status is distinct from v_status;
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Trigger execution does not require granting the trigger function as an RPC.
revoke all on function public.asc_sync_slot_occupancy() from public, anon, authenticated;

create trigger trg_sets_slot_occupancy_before
before insert or delete or update of location_id, status, deleted_at
on public.storage_sets
for each row execute function public.asc_sync_slot_occupancy();

create trigger trg_sets_slot_occupancy_after
after insert or delete or update of location_id, status, deleted_at
on public.storage_sets
for each row execute function public.asc_sync_slot_occupancy();

-- Repair stale derived flags under the same brief write gate. A blocked slot
-- is a staff decision and is deliberately never changed by reconciliation.
update public.locations l
   set status = case when exists (
     select 1 from public.storage_sets s
      where s.location_id = l.id and s.deleted_at is null
        and s.status in ('in_storage', 'reserved')
   ) then 'occupied' else 'free' end
 where l.status <> 'blocked'
   and l.status is distinct from (case when exists (
     select 1 from public.storage_sets s
      where s.location_id = l.id and s.deleted_at is null
        and s.status in ('in_storage', 'reserved')
   ) then 'occupied' else 'free' end);

commit;
