-- ============================================================================
-- ASC Tire Hotel — suggest a free seat next to this customer's other sets
-- ----------------------------------------------------------------------------
-- ADDITIVE. Replaces suggest_free_slot(text). Apply after the locations
-- migration. SECURITY INVOKER so row level security still applies. search_path
-- is pinned. Grants stay as they were: anon and public cannot execute it,
-- authenticated can.
--
-- With a customer id, phone, or plate, a free seat in the same zone beats the
-- global order, then the same rack, then the adjacent shelf or slot. With no
-- match, the old order remains: warehouse, zone, rack, shelf, slot.
-- ============================================================================

drop function if exists public.suggest_free_slot(text);

create function public.suggest_free_slot(
  warehouse text default null,
  customer_id uuid default null,
  phone text default null,
  plate text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_near text;
  v_code text;
  v_cluster boolean;
  v_warehouse text := nullif(btrim(coalesce(warehouse, '')), '');
  v_customer uuid := customer_id;
  v_phone text := nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '');
  v_plate text := nullif(upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  perform public.asc_require_staff();

  select
    l.id,
    case when coalesce(best.zone_miss, 1) = 0 then best.near_label end,
    case when coalesce(best.zone_miss, 1) = 0 then best.public_code end,
    coalesce(best.zone_miss, 1) = 0
  into v_id, v_near, v_code, v_cluster
  from public.locations l
  left join lateral (
    select ranked.public_code, ranked.near_label, ranked.zone_miss, ranked.rack_miss, ranked.gap
    from (
      select
        s.public_code,
        concat_ws('-',
          nullif(held.zone, ''),
          nullif(held.rack, ''),
          nullif(held.shelf, ''),
          nullif(held.slot, '')
        ) as near_label,
        case when l.warehouse = held.warehouse and l.zone = held.zone then 0 else 1 end as zone_miss,
        case
          when l.warehouse = held.warehouse and l.zone = held.zone and l.rack = held.rack then 0
          else 1
        end as rack_miss,
        case
          when l.warehouse = held.warehouse and l.zone = held.zone and l.rack = held.rack then
            (case
              when l.shelf = held.shelf then 0
              when l.shelf ~ '^[0-9]+$' and held.shelf ~ '^[0-9]+$' then abs(l.shelf::int - held.shelf::int)
              when l.shelf ~ '^[A-Za-z]$' and held.shelf ~ '^[A-Za-z]$'
                then abs(ascii(upper(l.shelf)) - ascii(upper(held.shelf)))
              else 50
            end)
            +
            (case
              when l.slot = held.slot then 0
              when l.slot ~ '^[0-9]+$' and held.slot ~ '^[0-9]+$' then abs(l.slot::int - held.slot::int)
              when l.slot ~ '^[A-Za-z]$' and held.slot ~ '^[A-Za-z]$'
                then abs(ascii(upper(l.slot)) - ascii(upper(held.slot)))
              else 50
            end)
          else 1000000
        end as gap
      from public.storage_sets s
      join public.vehicles veh on veh.id = s.vehicle_id
      join public.customers cust on cust.id = veh.customer_id
      join public.locations held on held.id = s.location_id
      where s.deleted_at is null
        and s.status in ('in_storage', 'reserved')
        and (v_warehouse is null or held.warehouse = v_warehouse)
        and (v_customer is not null or v_phone is not null or v_plate is not null)
        and (
          (v_customer is not null and cust.id = v_customer)
          or (v_phone is not null and regexp_replace(coalesce(cust.phone, ''), '\D', '', 'g') = v_phone)
          or (v_plate is not null and upper(regexp_replace(coalesce(veh.plate, ''), '[^A-Za-z0-9]', '', 'g')) = v_plate)
        )
    ) ranked
    order by ranked.zone_miss, ranked.rack_miss, ranked.gap, ranked.near_label
    limit 1
  ) best on (v_customer is not null or v_phone is not null or v_plate is not null)
  where l.status = 'free'
    and (v_warehouse is null or l.warehouse = v_warehouse)
    and not exists (
      select 1 from public.storage_sets s
       where s.location_id = l.id
         and s.deleted_at is null
         and s.status in ('in_storage', 'reserved')
    )
  order by
    coalesce(best.zone_miss, 1),
    coalesce(best.rack_miss, 1),
    coalesce(best.gap, 1000000),
    l.warehouse, l.zone, l.rack, l.shelf, l.slot
  limit 1;

  if not found then
    return null;
  end if;

  return public.asc_location_json(v_id) || case
    when v_cluster and v_near is not null then jsonb_build_object('near_label', v_near, 'near_code', v_code)
    else '{}'::jsonb
  end;
end;
$$;

revoke all on function public.suggest_free_slot(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.suggest_free_slot(text, uuid, text, text) to authenticated;
