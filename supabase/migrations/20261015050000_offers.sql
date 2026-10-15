-- Offers: buyer-facing drafts, a separate internal ledger, and a grant list.
-- Apply with the other migrations. This file does not connect to a live project.
--
-- Status moves only through set_offer_status: draft -> approved -> sent.
-- Reject is draft|approved -> rejected, and only an admin or manager may
-- approve or reject. Nothing reaches sent unless approved_by is set.
-- There is no email and no SMS in this schema.
--
-- Internal figures (entry price, cost, margin, notes, supplier/source) live
-- in offer_internal. RLS uses can_see_offer_internal(): admins (asc_is_admin)
-- or a row in offer_internal_access. A person's name or email is not an
-- access check.

-- ----------------------------------------------------------------------------
-- Buyer-facing offer
-- ----------------------------------------------------------------------------
create table if not exists public.offers (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid references public.storage_sets(id) on delete set null,
  customer_name text not null,
  phone         text,
  email         text,
  lines         jsonb not null default '[]'::jsonb,
  total         numeric(12,2) not null default 0,
  currency      text not null default 'EUR',
  terms         text,
  valid_until   date,
  status        text not null default 'draft'
                  check (status in ('draft', 'approved', 'sent', 'rejected')),
  created_by    uuid,
  created_via   text not null default 'manual'
                  check (created_via in ('nero', 'manual')),
  approved_by   uuid,
  approved_at   timestamptz,
  sent_at       timestamptz,
  customer_snapshot jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_offers_status  on public.offers (status);
create index if not exists idx_offers_set     on public.offers (set_id);
create index if not exists idx_offers_created on public.offers (created_at desc);

-- Snapshot of every storage set that belonged to the customer at creation.
-- set_id stays a live FK so the app can open the set; the text columns are
-- the copy captured for the offer.
create table if not exists public.offer_related_sets (
  id                uuid primary key default gen_random_uuid(),
  offer_id          uuid not null references public.offers(id) on delete cascade,
  set_id            uuid references public.storage_sets(id) on delete set null,
  public_code       text,
  season            text,
  tire_size         text,
  tire_brand        text,
  zone              text,
  rack              text,
  shelf             text,
  slot              text,
  status            text,
  check_in_date     date,
  swap_at           timestamptz,
  expected_out_date date,
  keep_plan         text,
  plate             text,
  vehicle_label     text
);

create index if not exists idx_offer_sets_offer on public.offer_related_sets (offer_id);
create index if not exists idx_offer_sets_set   on public.offer_related_sets (set_id);
create unique index if not exists uq_offer_sets_live
  on public.offer_related_sets (offer_id, set_id) where set_id is not null;

-- ----------------------------------------------------------------------------
-- Internal ledger. Not part of the buyer copy.
-- ----------------------------------------------------------------------------
create table if not exists public.offer_internal (
  offer_id       uuid primary key references public.offers(id) on delete cascade,
  entry_price    numeric(12,2),
  internal_cost  numeric(12,2),
  margin         numeric(12,2),
  internal_notes text,
  source_name    text,
  source_contact text,
  source_ref     text,
  source_notes   text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.offer_internal_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  can_grant  boolean not null default false
);

create table if not exists public.offer_internal_access_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor          uuid,
  target_user_id uuid,
  action         text not null,
  can_grant      boolean,
  detail         text
);

create index if not exists idx_offer_access_log_at
  on public.offer_internal_access_log (at desc);

-- ----------------------------------------------------------------------------
-- Who may see internal figures. SECURITY DEFINER so the policy can read the
-- grant table without exposing it. EXECUTE is authenticated only.
-- ----------------------------------------------------------------------------
create or replace function public.can_see_offer_internal()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.asc_is_admin()
      or exists (
        select 1
          from public.offer_internal_access a
         where a.user_id = auth.uid()
      );
$$;

create or replace function public.offer_internal_actor_can_grant()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.asc_is_admin()
      or exists (
        select 1
          from public.offer_internal_access a
         where a.user_id = auth.uid()
           and a.can_grant
      );
$$;

revoke all on function public.can_see_offer_internal() from public, anon;
revoke all on function public.offer_internal_actor_can_grant() from public, anon;
grant execute on function public.can_see_offer_internal() to authenticated;
grant execute on function public.offer_internal_actor_can_grant() to authenticated;

-- ----------------------------------------------------------------------------
-- Buyer lines only. Drops entry price, cost, margin, notes, and source keys,
-- and refuses image paths that are not a generated id.
-- ----------------------------------------------------------------------------
create or replace function public.offer_num(p_text text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_text is null or p_text !~ '^-?[0-9]+(\.[0-9]+)?$' then
    return 0;
  end if;
  return p_text::numeric;
end;
$$;

create or replace function public.offer_buyer_lines(p_lines jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(line order by ord), '[]'::jsonb)
    from (
      select ord,
             jsonb_strip_nulls(jsonb_build_object(
               'description', left(coalesce(item->>'description', ''), 400),
               'qty', greatest(public.offer_num(item->>'qty'), 0),
               'unit_price', public.offer_num(item->>'unit_price'),
               'image_path', case
                 when coalesce(item->>'image_path', '') ~* '^offers/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
                 then item->>'image_path' else null end,
               'image_url', case
                 when coalesce(item->>'image_url', '') ~* '^https?://'
                 then left(item->>'image_url', 1000) else null end
             )) as line
        from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end)
             with ordinality as t(item, ord)
    ) s;
$$;

revoke all on function public.offer_num(text) from public, anon;
revoke all on function public.offer_buyer_lines(jsonb) from public, anon;
grant execute on function public.offer_num(text) to authenticated;
grant execute on function public.offer_buyer_lines(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Capture the saved customer and their sets when a draft is inserted.
-- SECURITY INVOKER: the caller's RLS applies to customers and sets.
-- ----------------------------------------------------------------------------
create or replace function public.offer_before_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_n int;
  v_snap jsonb;
  v_phone_digits text;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
    new.sent_at := null;
    new.created_by := auth.uid();
    if new.created_via is null or new.created_via not in ('nero', 'manual') then
      new.created_via := 'manual';
    end if;
    if new.currency is null or btrim(new.currency) = '' then
      new.currency := 'EUR';
    end if;

    if new.set_id is not null then
      select v.customer_id into v_customer_id
        from public.storage_sets s
        left join public.vehicles v on v.id = s.vehicle_id
       where s.id = new.set_id;
    end if;

    v_phone_digits := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
    if v_customer_id is null and length(v_phone_digits) >= 6 then
      select count(*) into v_n
        from public.customers c
       where regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone_digits;
      if v_n = 1 then
        select c.id into v_customer_id
          from public.customers c
         where regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone_digits;
      end if;
    end if;

    if v_customer_id is null and nullif(btrim(new.customer_name), '') is not null then
      select count(*) into v_n
        from public.customers c
       where lower(btrim(c.name)) = lower(btrim(new.customer_name));
      if v_n = 1 then
        select c.id into v_customer_id
          from public.customers c
         where lower(btrim(c.name)) = lower(btrim(new.customer_name));
      end if;
    end if;

    if v_customer_id is null then
      new.customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
        'name', nullif(btrim(new.customer_name), ''),
        'phone', nullif(btrim(new.phone), ''),
        'email', nullif(btrim(new.email), '')
      ));
    else
      select jsonb_strip_nulls(
               (to_jsonb(c) - 'created_at')
               || jsonb_build_object(
                    'customer_id', c.id,
                    'vehicles', coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'id', v.id, 'plate', v.plate, 'make', v.make,
                               'model', v.model, 'year', v.year
                             ) order by v.created_at)
                        from public.vehicles v
                       where v.customer_id = c.id
                    ), '[]'::jsonb)
                  )
             )
        into v_snap
        from public.customers c
       where c.id = v_customer_id;

      -- Prefer the vehicle on the originating set, otherwise the first saved one.
      v_snap := v_snap || coalesce((
        select jsonb_build_object(
                 'plate', v.plate, 'make', v.make, 'model', v.model, 'year', v.year,
                 'vehicle_id', v.id
               )
          from public.storage_sets s
          join public.vehicles v on v.id = s.vehicle_id
         where s.id = new.set_id
      ), (
        select jsonb_build_object(
                 'plate', v.plate, 'make', v.make, 'model', v.model, 'year', v.year,
                 'vehicle_id', v.id
               )
          from public.vehicles v
         where v.customer_id = v_customer_id
         order by v.created_at
         limit 1
      ), '{}'::jsonb);

      new.customer_snapshot := v_snap;
      if nullif(btrim(new.phone), '') is null then
        new.phone := v_snap->>'phone';
      end if;
      if nullif(btrim(new.email), '') is null then
        new.email := v_snap->>'email';
      end if;
    end if;
  else
    new.created_by := old.created_by;
    new.created_via := old.created_via;
    new.customer_snapshot := old.customer_snapshot;

    if new.status is distinct from old.status
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.sent_at is distinct from old.sent_at then
      if current_setting('asc.offer_status_rpc', true) is distinct from '1' then
        raise exception 'Status changes go through set_offer_status.'
          using errcode = '42501';
      end if;
      if new.status = 'approved' and old.status <> 'draft' then
        raise exception 'Only a draft can be approved.' using errcode = '42501';
      end if;
      if new.status = 'rejected' and old.status not in ('draft', 'approved') then
        raise exception 'This offer can no longer be rejected.' using errcode = '42501';
      end if;
      if new.status = 'sent' then
        if old.status <> 'approved' then
          raise exception 'An offer must be approved before it can be marked sent.'
            using errcode = '42501';
        end if;
        if new.approved_by is null then
          raise exception 'Nothing can reach sent unless it was approved.'
            using errcode = '42501';
        end if;
      end if;
      if new.status = 'draft' and old.status <> 'draft' then
        raise exception 'A finished offer cannot return to draft.' using errcode = '42501';
      end if;
    end if;
  end if;

  new.lines := public.offer_buyer_lines(new.lines);
  new.total := coalesce((
    select round(sum(
             public.offer_num(item->>'qty') * public.offer_num(item->>'unit_price')
           ), 2)
      from jsonb_array_elements(new.lines) item
  ), 0);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.offer_after_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := nullif(new.customer_snapshot->>'customer_id', '')::uuid;
  if v_customer_id is null then
    return new;
  end if;

  if to_regclass('public.tires') is null then
    insert into public.offer_related_sets (
      offer_id, set_id, public_code, season, tire_size, tire_brand,
      zone, rack, shelf, slot, status, check_in_date, swap_at,
      expected_out_date, keep_plan, plate, vehicle_label
    )
    select new.id, s.id, s.public_code, s.season, null, null,
           s.zone, s.rack, s.shelf, s.slot, s.status, s.check_in_date, s.swap_at,
           s.expected_out_date, s.keep_plan, v.plate,
           nullif(btrim(concat_ws(' ', v.year::text, v.make, v.model)), '')
      from public.storage_sets s
      join public.vehicles v on v.id = s.vehicle_id
     where v.customer_id = v_customer_id
       and s.deleted_at is null;
  else
    insert into public.offer_related_sets (
      offer_id, set_id, public_code, season, tire_size, tire_brand,
      zone, rack, shelf, slot, status, check_in_date, swap_at,
      expected_out_date, keep_plan, plate, vehicle_label
    )
    select new.id, s.id, s.public_code, s.season,
           (select string_agg(distinct nullif(btrim(t.size), ''), ', ')
              from public.tires t where t.set_id = s.id),
           (select string_agg(distinct nullif(btrim(t.brand), ''), ', ')
              from public.tires t where t.set_id = s.id),
           s.zone, s.rack, s.shelf, s.slot, s.status, s.check_in_date, s.swap_at,
           s.expected_out_date, s.keep_plan, v.plate,
           nullif(btrim(concat_ws(' ', v.year::text, v.make, v.model)), '')
      from public.storage_sets s
      join public.vehicles v on v.id = s.vehicle_id
     where v.customer_id = v_customer_id
       and s.deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_offers_before on public.offers;
create trigger trg_offers_before
  before insert or update on public.offers
  for each row execute function public.offer_before_write();

drop trigger if exists trg_offers_after on public.offers;
create trigger trg_offers_after
  after insert on public.offers
  for each row execute function public.offer_after_insert();

revoke all on function public.offer_before_write() from public, anon, authenticated;
revoke all on function public.offer_after_insert() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Status RPC. DEFINER so the draft-only UPDATE policy cannot block a legal
-- transition. search_path is pinned. anon cannot execute it.
-- The trigger still enforces draft -> approved -> sent and approved_by.
-- ----------------------------------------------------------------------------
create or replace function public.set_offer_status(p_offer_id uuid, p_status text)
returns public.offers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.offers;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if public.asc_role() not in ('admin', 'manager', 'employee', 'reception') then
    raise exception 'You do not have permission.' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'sent') then
    raise exception 'Unsupported status.' using errcode = '22023';
  end if;

  select * into v from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;

  if p_status in ('approved', 'rejected') and not public.asc_is_admin() then
    raise exception 'Only an admin or manager can approve or reject.'
      using errcode = '42501';
  end if;

  perform set_config('asc.offer_status_rpc', '1', true);
  if p_status = 'approved' then
    update public.offers
       set status = 'approved',
           approved_by = auth.uid(),
           approved_at = now()
     where id = p_offer_id
     returning * into v;
  elsif p_status = 'rejected' then
    update public.offers
       set status = 'rejected'
     where id = p_offer_id
     returning * into v;
  else
    update public.offers
       set status = 'sent',
           sent_at = now()
     where id = p_offer_id
     returning * into v;
  end if;
  return v;
end;
$$;

revoke all on function public.set_offer_status(uuid, text) from public, anon;
grant execute on function public.set_offer_status(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Grant management. Admins, and rows with can_grant, may grant or revoke.
-- Nobody can revoke an admin or a manager (they see internal data by role).
-- Only an admin may hand out can_grant.
-- ----------------------------------------------------------------------------
create or replace function public.grant_offer_internal_access(
  p_user_id uuid,
  p_can_grant boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_can boolean := coalesce(p_can_grant, false);
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if not public.offer_internal_actor_can_grant() then
    raise exception 'You cannot grant internal access.' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'That person is not on the staff list.' using errcode = 'P0002';
  end if;
  if v_can and not public.asc_is_admin() then
    raise exception 'Only an admin can grant the ability to grant.'
      using errcode = '42501';
  end if;

  insert into public.offer_internal_access (user_id, granted_by, granted_at, can_grant)
  values (p_user_id, auth.uid(), now(), v_can)
  on conflict (user_id) do update
    set granted_by = auth.uid(),
        granted_at = now(),
        can_grant = excluded.can_grant;

  insert into public.offer_internal_access_log (actor, target_user_id, action, can_grant, detail)
  values (auth.uid(), p_user_id, 'grant', v_can, 'internal access granted');
end;
$$;

create or replace function public.revoke_offer_internal_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if not public.offer_internal_actor_can_grant() then
    raise exception 'You cannot revoke internal access.' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if v_role in ('admin', 'manager') then
    raise exception 'An admin cannot be revoked.' using errcode = '42501';
  end if;

  delete from public.offer_internal_access where user_id = p_user_id;
  insert into public.offer_internal_access_log (actor, target_user_id, action, can_grant, detail)
  values (auth.uid(), p_user_id, 'revoke', false, 'internal access revoked');
end;
$$;

create or replace function public.list_offer_internal_access()
returns table (
  user_id uuid,
  full_name text,
  role text,
  email text,
  granted boolean,
  can_grant boolean,
  granted_at timestamptz,
  granted_by uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.offer_internal_actor_can_grant() then
    raise exception 'You cannot manage internal access.' using errcode = '42501';
  end if;
  return query
  select p.id,
         p.full_name,
         p.role,
         case when public.asc_is_admin() then p.email else null end,
         (p.role in ('admin', 'manager') or a.user_id is not null),
         (p.role in ('admin', 'manager') or coalesce(a.can_grant, false)),
         a.granted_at,
         a.granted_by
    from public.profiles p
    left join public.offer_internal_access a on a.user_id = p.id
   where p.role is distinct from 'readonly'
   order by p.full_name nulls last, p.role;
end;
$$;

create or replace function public.list_offer_internal_access_log()
returns setof public.offer_internal_access_log
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.offer_internal_actor_can_grant() then
    raise exception 'You cannot manage internal access.' using errcode = '42501';
  end if;
  return query
  select * from public.offer_internal_access_log
   order by at desc
   limit 40;
end;
$$;

revoke all on function public.grant_offer_internal_access(uuid, boolean) from public, anon;
revoke all on function public.revoke_offer_internal_access(uuid) from public, anon;
revoke all on function public.list_offer_internal_access() from public, anon;
revoke all on function public.list_offer_internal_access_log() from public, anon;
grant execute on function public.grant_offer_internal_access(uuid, boolean) to authenticated;
grant execute on function public.revoke_offer_internal_access(uuid) to authenticated;
grant execute on function public.list_offer_internal_access() to authenticated;
grant execute on function public.list_offer_internal_access_log() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.offers enable row level security;
alter table public.offer_related_sets enable row level security;
alter table public.offer_internal enable row level security;
alter table public.offer_internal_access enable row level security;
alter table public.offer_internal_access_log enable row level security;

drop policy if exists offers_select on public.offers;
drop policy if exists offers_insert on public.offers;
drop policy if exists offers_update on public.offers;
create policy offers_select on public.offers
  for select to authenticated
  using (public.asc_role() <> 'readonly');
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and status = 'draft'
    and created_by = auth.uid()
  );
create policy offers_update on public.offers
  for update to authenticated
  using (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and status = 'draft'
  )
  with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and status = 'draft'
  );

drop policy if exists offer_sets_select on public.offer_related_sets;
drop policy if exists offer_sets_insert on public.offer_related_sets;
create policy offer_sets_select on public.offer_related_sets
  for select to authenticated
  using (public.asc_role() <> 'readonly');
create policy offer_sets_insert on public.offer_related_sets
  for insert to authenticated
  with check (
    public.asc_role() in ('admin', 'manager', 'employee', 'reception')
    and exists (
      select 1 from public.offers o
       where o.id = offer_id
         and o.created_by = auth.uid()
    )
  );

drop policy if exists offer_internal_select on public.offer_internal;
drop policy if exists offer_internal_insert on public.offer_internal;
drop policy if exists offer_internal_update on public.offer_internal;
create policy offer_internal_select on public.offer_internal
  for select to authenticated
  using (public.can_see_offer_internal());
create policy offer_internal_insert on public.offer_internal
  for insert to authenticated
  with check (public.can_see_offer_internal());
create policy offer_internal_update on public.offer_internal
  for update to authenticated
  using (public.can_see_offer_internal())
  with check (public.can_see_offer_internal());

-- Direct writes are closed. Grants go through the RPCs above.
drop policy if exists offer_access_select on public.offer_internal_access;
create policy offer_access_select on public.offer_internal_access
  for select to authenticated
  using (public.offer_internal_actor_can_grant());

drop policy if exists offer_access_log_select on public.offer_internal_access_log;
create policy offer_access_log_select on public.offer_internal_access_log
  for select to authenticated
  using (public.offer_internal_actor_can_grant());

revoke all on table public.offers from public, anon;
revoke all on table public.offer_related_sets from public, anon;
revoke all on table public.offer_internal from public, anon;
revoke all on table public.offer_internal_access from public, anon;
revoke all on table public.offer_internal_access_log from public, anon;

grant select, insert, update on table public.offers to authenticated;
grant select, insert on table public.offer_related_sets to authenticated;
grant select, insert, update on table public.offer_internal to authenticated;
grant select on table public.offer_internal_access to authenticated;
grant select on table public.offer_internal_access_log to authenticated;

-- ----------------------------------------------------------------------------
-- Default grant holder.
-- Do not match a name or an email. This looks at profiles only for a row that
-- is already marked, and there is no such marker in this database, so the
-- person cannot be resolved safely.
-- TODO: an admin opens Offers → Internal access and grants the default holder
-- with "can grant". Admins and managers already see internal data through
-- asc_is_admin() and do not need a row here.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from public.profiles p
   where false;
  if v_n = 1 then
    insert into public.offer_internal_access (user_id, granted_by, can_grant)
    select p.id, null, true
      from public.profiles p
     where false;
  else
    raise notice 'offer_internal_access: default grant was not seeded. TODO: an admin grants access in the Internal access screen.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Realtime. Internal tables stay off the publication.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'offers'
  ) then
    execute 'alter publication supabase_realtime add table public.offers';
  end if;
exception when others then
  raise notice 'realtime add offers skipped: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- Private bucket for offer-line photos. Names are generated ids; the app
-- does not store the original filename or supplier text in object metadata.
-- Staff who can open offers can read the photos (they are buyer-facing).
-- Source text is not stored on the object.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('offer-images', 'offer-images', false)
  on conflict (id) do nothing;
  execute 'drop policy if exists "offer-images read" on storage.objects';
  execute 'drop policy if exists "offer-images write" on storage.objects';
  execute 'drop policy if exists "offer-images delete" on storage.objects';
  execute 'create policy "offer-images read" on storage.objects for select to authenticated using (bucket_id = ''offer-images'' and public.asc_role() <> ''readonly'')';
  execute 'create policy "offer-images write" on storage.objects for insert to authenticated with check (bucket_id = ''offer-images'' and public.asc_role() in (''admin'',''manager'',''employee'',''reception''))';
  execute 'create policy "offer-images delete" on storage.objects for delete to authenticated using (bucket_id = ''offer-images'' and public.asc_role() in (''admin'',''manager'',''employee'',''reception''))';
exception when others then
  raise notice 'offer-images bucket skipped (%). Create a PRIVATE bucket named offer-images.', sqlerrm;
end $$;
