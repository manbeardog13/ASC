-- ============================================================================
-- ASC Tire Hotel — database schema for Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Run this ONCE (and it is safe to re-run to upgrade):
--   Supabase dashboard  ->  SQL Editor  ->  New query  ->  paste all  ->  Run
--
-- Creates the tables, auto-generated set codes (ASC-2026-0042), search indexes,
-- Row Level Security, realtime, an audit log, soft deletes, roles, and backup
-- bookkeeping. Every block is idempotent.
-- ============================================================================

create sequence if not exists set_code_seq;

-- ----------------------------------------------------------------------------
-- Core tables
-- ----------------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists vehicles (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  make        text,
  model       text,
  year        int,
  plate       text,
  created_at  timestamptz not null default now()
);

create table if not exists storage_sets (
  id               uuid primary key default gen_random_uuid(),
  public_code      text not null unique
                     default ('ASC-' || to_char(current_date, 'YYYY') || '-' ||
                              lpad(nextval('set_code_seq')::text, 4, '0')),
  vehicle_id       uuid references vehicles(id) on delete set null,
  season           text not null default 'winter',      -- winter | summer | all_season
  on_rims          boolean not null default false,
  rim_type         text,
  quantity         int not null default 4,
  zone             text,
  rack             text,
  shelf            text,
  slot             text,
  check_in_date    date not null default current_date,
  expected_out_date date,
  fee              numeric(10,2),
  paid             boolean not null default false,
  status           text not null default 'in_storage',  -- in_storage | reserved | checked_out | missing
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists tires (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references storage_sets(id) on delete cascade,
  position        text,
  size            text,
  brand           text,
  model           text,
  tread_mm        numeric(4,1),
  dot_code        text,
  studded         boolean not null default false,
  condition_notes text
);

create table if not exists photos (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references storage_sets(id) on delete cascade,
  path        text not null,
  caption     text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- v2 columns (added only if missing — safe on an existing database)
-- ----------------------------------------------------------------------------
alter table storage_sets add column if not exists deleted_at   timestamptz;      -- soft delete / recycle bin
alter table storage_sets add column if not exists picked_up_at timestamptz;      -- audit timestamp
alter table storage_sets add column if not exists reserved_at  timestamptz;
alter table storage_sets add column if not exists qr_version   int not null default 2;  -- QR payload version
alter table storage_sets add column if not exists reminded_at  timestamptz;      -- last pickup reminder sent

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_sets_status     on storage_sets(status);
create index if not exists idx_sets_season     on storage_sets(season);
create index if not exists idx_sets_code       on storage_sets(public_code);
create index if not exists idx_sets_deleted    on storage_sets(deleted_at);
create index if not exists idx_sets_location   on storage_sets(zone, rack, shelf, slot);
create index if not exists idx_vehicles_plate  on vehicles(plate);
create index if not exists idx_vehicles_cust   on vehicles(customer_id);
create index if not exists idx_tires_set       on tires(set_id);
create index if not exists idx_photos_set      on photos(set_id);

-- ----------------------------------------------------------------------------
-- updated_at freshness
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sets_updated on storage_sets;
create trigger trg_sets_updated before update on storage_sets
  for each row execute function set_updated_at();

-- ============================================================================
-- ROLES  (manager | employee | reception | readonly)
-- One row per auth user. Missing row => treated as 'manager' so the original
-- single-login owner is never locked out.
-- ============================================================================
create table if not exists profiles (
  id         uuid primary key,   -- = auth.users.id (no cross-schema FK, to avoid privilege issues)
  email      text,
  full_name  text,
  role       text not null default 'employee',
  created_at timestamptz not null default now()
);

-- New signups get a profile automatically; the very first user is a manager.
create or replace function handle_new_user() returns trigger as $$
declare first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;
  insert into public.profiles (id, email, role)
    values (new.id, new.email, case when first_user then 'manager' else 'employee' end)
    on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Backfill existing users + attach the signup trigger. Both touch auth.users,
-- which some projects restrict — each is wrapped so a privilege error can NEVER
-- abort the whole migration. Even if skipped, asc_role() below defaults a missing
-- profile to 'manager', so the owner keeps full access; add staff roles by hand.
do $$
begin
  insert into public.profiles (id, email, role)
    select id, email, 'manager' from auth.users on conflict (id) do nothing;
exception when others then raise notice 'profiles backfill skipped: %', sqlerrm;
end $$;

do $$
begin
  execute 'drop trigger if exists trg_new_user on auth.users';
  execute 'create trigger trg_new_user after insert on auth.users for each row execute function handle_new_user()';
exception when others then raise notice 'auth.users signup trigger skipped (set new staff roles in the profiles table): %', sqlerrm;
end $$;

-- Caller's role. Defaults to least-privilege 'readonly' when no profile row
-- exists, so a brand-new login can never silently get admin rights. The shop
-- owner is backfilled as 'manager' above; grant staff a role by inserting a
-- profiles row (see SETUP.md).
create or replace function asc_role() returns text as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'readonly');
$$ language sql stable security definer set search_path = public, pg_temp;

-- ============================================================================
-- AUDIT LOG  (event sourcing — who did what, when; never overwritten)
-- ============================================================================
create table if not exists audit_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  entity_type text not null,          -- storage_sets | photos
  entity_id   uuid,
  set_code    text,
  action      text not null,          -- created | moved | status_changed | payment | photo_added | deleted | restored | purged | updated
  summary     text,
  changes     jsonb not null default '{}'::jsonb
);
create index if not exists idx_audit_entity on audit_events(entity_id, at desc);
create index if not exists idx_audit_code   on audit_events(set_code, at desc);

create or replace function asc_audit() returns trigger as $$
declare
  v_actor uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_action text; v_summary text; v_code text; v_entity uuid; v_changes jsonb := '{}'::jsonb;
begin
  if TG_TABLE_NAME = 'storage_sets' then
    if TG_OP = 'INSERT' then
      v_action := 'created'; v_entity := NEW.id; v_code := NEW.public_code; v_summary := 'Set created';
    elsif TG_OP = 'DELETE' then
      v_action := 'purged'; v_entity := OLD.id; v_code := OLD.public_code; v_summary := 'Permanently deleted';
    else
      v_entity := NEW.id; v_code := NEW.public_code;
      if OLD.deleted_at is null and NEW.deleted_at is not null then
        v_action := 'deleted'; v_summary := 'Moved to recycle bin';
      elsif OLD.deleted_at is not null and NEW.deleted_at is null then
        v_action := 'restored'; v_summary := 'Restored from recycle bin';
      elsif OLD.status is distinct from NEW.status then
        v_action := 'status_changed'; v_summary := OLD.status || ' → ' || NEW.status;
        v_changes := jsonb_build_object('from', OLD.status, 'to', NEW.status);
      elsif OLD.zone is distinct from NEW.zone or OLD.rack is distinct from NEW.rack
         or OLD.shelf is distinct from NEW.shelf or OLD.slot is distinct from NEW.slot then
        v_action := 'moved'; v_summary := 'Location changed';
        v_changes := jsonb_build_object(
          'from', jsonb_build_object('zone',OLD.zone,'rack',OLD.rack,'shelf',OLD.shelf,'slot',OLD.slot),
          'to',   jsonb_build_object('zone',NEW.zone,'rack',NEW.rack,'shelf',NEW.shelf,'slot',NEW.slot));
      elsif OLD.paid is distinct from NEW.paid then
        v_action := 'payment'; v_summary := case when NEW.paid then 'Marked paid' else 'Marked unpaid' end;
      else
        v_action := 'updated'; v_summary := 'Details updated';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'photos' then
    if TG_OP = 'INSERT' then
      v_action := 'photo_added'; v_entity := NEW.set_id; v_summary := 'Photo added';
    else
      -- Skip auditing photos deleted by a parent-set cascade: the set is already
      -- gone, so its 'purged' event covers it and we'd otherwise log a NULL code.
      if not exists (select 1 from storage_sets where id = OLD.set_id) then return OLD; end if;
      v_action := 'photo_removed'; v_entity := OLD.set_id; v_summary := 'Photo removed';
    end if;
    select public_code into v_code from storage_sets where id = v_entity;
  end if;

  insert into audit_events (actor, actor_email, entity_type, entity_id, set_code, action, summary, changes)
    values (v_actor, v_email, TG_TABLE_NAME, v_entity, v_code, v_action, v_summary, v_changes);

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_audit_sets on storage_sets;
create trigger trg_audit_sets after insert or update or delete on storage_sets
  for each row execute function asc_audit();
drop trigger if exists trg_audit_photos on photos;
create trigger trg_audit_photos after insert or delete on photos
  for each row execute function asc_audit();

-- ============================================================================
-- SOFT-DELETE PURGE  (recycle bin retention — hard-delete after N days)
-- Run by the nightly backup workflow, or manually. Cascades tires/photos rows.
-- ============================================================================
create or replace function purge_deleted(older_than interval default interval '30 days')
returns int as $$
declare n int;
begin
  with del as (
    delete from storage_sets
    where deleted_at is not null and deleted_at < now() - older_than
    returning 1
  ) select count(*) into n from del;
  return n;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ============================================================================
-- BACKUP BOOKKEEPING  (feeds the "Last backup" tile on the health dashboard)
-- ============================================================================
create table if not exists backup_runs (
  id          bigint generated always as identity primary key,
  kind        text not null,        -- db | csv | verify | purge
  status      text not null,        -- success | failed
  detail      text,
  size_bytes  bigint,
  started_at  timestamptz,
  finished_at timestamptz not null default now()
);
create index if not exists idx_backup_runs_at on backup_runs(finished_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table customers    enable row level security;
alter table vehicles     enable row level security;
alter table storage_sets enable row level security;
alter table tires        enable row level security;
alter table photos       enable row level security;
alter table profiles     enable row level security;
alter table audit_events enable row level security;
alter table backup_runs  enable row level security;

-- Customers / vehicles / tires / photos: any authenticated user reads & writes;
-- only managers may hard-delete (child rows also cascade from set deletes).
do $$
declare tbl text;
begin
  foreach tbl in array array['customers','vehicles','tires','photos'] loop
    execute format('drop policy if exists "auth full access" on %I', tbl);
    execute format('drop policy if exists "%s_rw" on %I', tbl, tbl);
    execute format('drop policy if exists "%s_del" on %I', tbl, tbl);
    execute format('create policy "%s_rw" on %I for all to authenticated using (true) with check (true)', tbl, tbl);
  end loop;
end $$;

-- Storage sets: read = everyone signed in; write = staff; hard delete = manager.
drop policy if exists "auth full access" on storage_sets;
drop policy if exists "sets_select" on storage_sets;
drop policy if exists "sets_insert" on storage_sets;
drop policy if exists "sets_update" on storage_sets;
drop policy if exists "sets_delete" on storage_sets;
create policy "sets_select" on storage_sets for select to authenticated using (true);
create policy "sets_insert" on storage_sets for insert to authenticated
  with check (asc_role() in ('manager','employee','reception'));
create policy "sets_update" on storage_sets for update to authenticated
  using (asc_role() in ('manager','employee','reception'))
  with check (asc_role() in ('manager','employee','reception'));
create policy "sets_delete" on storage_sets for delete to authenticated
  using (asc_role() = 'manager');

-- Profiles: everyone signed in can read; only managers manage roles.
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_write"  on profiles;
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_write" on profiles for all to authenticated
  using (asc_role() = 'manager') with check (asc_role() = 'manager');

-- Audit log: append-only. Readable by all signed-in users; writes happen only
-- through the SECURITY DEFINER trigger, so there are no insert/update policies.
drop policy if exists "audit_select" on audit_events;
create policy "audit_select" on audit_events for select to authenticated using (true);

-- Backup runs: readable by all; the backup workflow writes via the DB owner.
drop policy if exists "backup_select" on backup_runs;
drop policy if exists "backup_insert" on backup_runs;
create policy "backup_select" on backup_runs for select to authenticated using (true);
create policy "backup_insert" on backup_runs for insert to authenticated
  with check (asc_role() = 'manager');

-- ============================================================================
-- REALTIME  (changes appear on every device within a second)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['customers','vehicles','storage_sets','tires','photos','audit_events','backup_runs'] loop
    begin
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    exception when others then raise notice 'realtime add % skipped: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ============================================================================
-- STORAGE bucket for condition photos (kept last; if your project restricts
-- storage DDL, just create a PRIVATE bucket named 'tire-photos' in the dashboard)
-- ============================================================================
do $$
begin
  insert into storage.buckets (id, name, public)
    values ('tire-photos', 'tire-photos', false) on conflict (id) do nothing;
  execute 'drop policy if exists "tire-photos auth read"   on storage.objects';
  execute 'drop policy if exists "tire-photos auth write"  on storage.objects';
  execute 'drop policy if exists "tire-photos auth delete" on storage.objects';
  execute 'create policy "tire-photos auth read" on storage.objects for select to authenticated using (bucket_id = ''tire-photos'')';
  execute 'create policy "tire-photos auth write" on storage.objects for insert to authenticated with check (bucket_id = ''tire-photos'')';
  execute 'create policy "tire-photos auth delete" on storage.objects for delete to authenticated using (bucket_id = ''tire-photos'')';
exception when others then
  raise notice 'Storage bucket/policies skipped (%). Create a PRIVATE bucket named tire-photos in the dashboard.', sqlerrm;
end $$;

-- ============================================================================
-- v3 — USER MANAGEMENT
-- Admins add/remove users and assign roles. A permanent owner account can never
-- be deleted or demoted. The user directory exposes only masked emails. Every
-- block below is idempotent and safe to re-run.
-- ----------------------------------------------------------------------------
--   Role tiers used app-wide:
--     admin | manager  -> ADMIN tier: manage users + everything in the app
--     employee | reception -> USER tier: normal shop staff
--     readonly            -> inert: no access to any data until an admin grants a role
-- ============================================================================

-- The permanent owner. This account can never be removed or demoted, by anyone.
create or replace function asc_owner_email() returns text as $$
  select 'cryptonii13@gmail.com'::text;
$$ language sql immutable;

-- ADMIN tier. 'manager' is kept admin-equivalent so the original owner backfill
-- (which used 'manager') keeps full rights even before this migration re-runs.
create or replace function asc_is_admin() returns boolean as $$
  select asc_role() in ('admin','manager');
$$ language sql stable security definer set search_path = public, pg_temp;

-- Pre-authorized emails ("invites"). An admin adds a user by allowlisting their
-- email with a role; when that person signs up with the same email, the row is
-- claimed by handle_new_user() and removed.
create table if not exists allowed_emails (
  email      text primary key,          -- always stored lower-cased
  full_name  text,
  role       text not null default 'employee',
  invited_by uuid,
  created_at timestamptz not null default now()
);

-- New signups: owner => admin; allowlisted email => its role (+ name, consumed);
-- very first account ever => admin (bootstrap); otherwise => readonly (inert).
create or replace function handle_new_user() returns trigger as $$
declare
  v_email   text := lower(coalesce(new.email, ''));
  v_pending public.allowed_emails%rowtype;
  v_role    text;
  v_name    text;
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;

  if v_email = lower(public.asc_owner_email()) then
    v_role := 'admin';
  else
    select * into v_pending from public.allowed_emails where email = v_email;
    if found then
      v_role := coalesce(v_pending.role, 'employee');
      v_name := v_pending.full_name;
    elsif first_user then
      v_role := 'admin';
    else
      v_role := 'readonly';
    end if;
  end if;

  -- CRITICAL: never let a profile-write problem abort the auth-user insert. If it
  -- did, Supabase rolls back the signup and bounces the login with "Database error
  -- saving new user" — the OAuth "goes all the way but lands back on login" bug.
  -- The `on conflict (id)` clause only covers the primary key; a pre-existing row
  -- that already owns this email would still trip the `uniq_profiles_email_ci`
  -- unique index and raise. Swallow ANY failure here: the user is still created and
  -- defaults to inert 'readonly' via asc_role() until an admin sorts the profile out.
  begin
    insert into public.profiles (id, email, full_name, role)
      values (new.id, new.email, v_name, v_role)
      on conflict (id) do nothing;
    delete from public.allowed_emails where email = v_email;
  exception when others then
    raise notice 'handle_new_user: profile write skipped for %: %', v_email, sqlerrm;
  end;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Owner guard: the owner row can never be deleted, demoted, re-keyed, or have its
-- email swapped away; and no other row may claim the owner email. profiles.id is
-- the auth.users id, so it is immutable for EVERY row — that closes a lockout where
-- an admin re-keys the owner's id to orphan their auth.uid(). Runs for all callers.
create or replace function asc_protect_owner() returns trigger as $$
declare owner_email text := lower(public.asc_owner_email());
begin
  if TG_OP = 'DELETE' then
    if lower(coalesce(OLD.email,'')) = owner_email then
      raise exception 'The owner account cannot be removed.';
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' then
    -- The owner account is always an admin (matches handle_new_user()).
    if lower(coalesce(NEW.email,'')) = owner_email then
      NEW.role := 'admin';
    end if;
    return NEW;
  end if;

  -- UPDATE: id is immutable (= auth.users id). This alone defeats the re-key lockout.
  if NEW.id is distinct from OLD.id then
    raise exception 'profiles.id is immutable';
  end if;
  -- No non-owner row may be relabeled with the owner email.
  if lower(coalesce(NEW.email,'')) = owner_email and lower(coalesce(OLD.email,'')) <> owner_email then
    raise exception 'The owner email cannot be assigned to another account.';
  end if;
  -- The owner stays an admin with its email intact.
  if lower(coalesce(OLD.email,'')) = owner_email then
    NEW.role  := 'admin';
    NEW.email := OLD.email;
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_protect_owner on profiles;
create trigger trg_protect_owner before insert or update or delete on profiles
  for each row execute function asc_protect_owner();

-- One profile per email (each maps 1:1 to an auth user). A row-level trigger can't
-- see across rows, so this constraint is what stops a second row being injected with
-- the owner email to impersonate the owner in the directory.
do $$
begin
  create unique index if not exists uniq_profiles_email_ci
    on public.profiles (lower(email)) where email is not null;
exception when others then raise notice 'profiles email unique index skipped (duplicate emails already exist?): %', sqlerrm;
end $$;

-- Guarantee the owner is an admin. If they've already signed up, promote their
-- profile; if not, leave a permanent admin invite that their first login claims.
do $$
begin
  update public.profiles set role = 'admin'
    where lower(coalesce(email,'')) = lower(public.asc_owner_email());
  if not exists (select 1 from public.profiles
                 where lower(coalesce(email,'')) = lower(public.asc_owner_email())) then
    insert into public.allowed_emails (email, full_name, role)
      values (lower(public.asc_owner_email()), 'Owner', 'admin')
      on conflict (email) do update set role = 'admin';
  end if;
exception when others then raise notice 'owner bootstrap skipped: %', sqlerrm;
end $$;

-- Masked user directory. SECURITY DEFINER so any signed-in staff member can read
-- the list without being able to read raw emails from the profiles table. Emails
-- come back as  c**********@gmail.com  (first letter + stars, domain revealed).
-- 'readonly' (inert) accounts get an empty list.
-- (drop first: v4 below changes the return type, and `create or replace` can't
--  redefine a function whose OUT row type differs — 42P13 on re-runs otherwise)
drop function if exists list_users();
create function list_users()
returns table (id uuid, full_name text, role text, email_masked text, is_owner boolean) as $$
  select
    p.id,
    p.full_name,
    p.role,
    case when coalesce(p.email,'') = '' then ''
         else left(p.email, 1)
              || repeat('*', greatest(char_length(split_part(p.email,'@',1)) - 1, 0))
              || case when position('@' in p.email) > 0 then '@' || split_part(p.email,'@',2) else '' end
    end as email_masked,
    lower(coalesce(p.email,'')) = lower(public.asc_owner_email()) as is_owner
  from public.profiles p
  where asc_role() <> 'readonly'
  order by (lower(coalesce(p.email,'')) = lower(public.asc_owner_email())) desc,
           p.full_name nulls last, p.email;
$$ language sql stable security definer set search_path = public, pg_temp;

grant execute on function list_users() to authenticated;

-- ----------------------------------------------------------------------------
-- v3 RLS — supersedes the policies defined earlier in this file.
-- 'readonly' is now a true no-access state; admins gain all manager powers.
-- ----------------------------------------------------------------------------
-- Customers / vehicles / tires / photos: staff (non-readonly) read & write.
do $$
declare tbl text;
begin
  foreach tbl in array array['customers','vehicles','tires','photos'] loop
    execute format('drop policy if exists "%s_rw" on %I', tbl, tbl);
    execute format('create policy "%s_rw" on %I for all to authenticated using (asc_role() <> ''readonly'') with check (asc_role() <> ''readonly'')', tbl, tbl);
  end loop;
end $$;

-- Storage sets: read = staff; write = staff; hard delete = admin.
drop policy if exists "sets_select" on storage_sets;
drop policy if exists "sets_insert" on storage_sets;
drop policy if exists "sets_update" on storage_sets;
drop policy if exists "sets_delete" on storage_sets;
create policy "sets_select" on storage_sets for select to authenticated using (asc_role() <> 'readonly');
create policy "sets_insert" on storage_sets for insert to authenticated
  with check (asc_role() in ('admin','manager','employee','reception'));
create policy "sets_update" on storage_sets for update to authenticated
  using (asc_role() in ('admin','manager','employee','reception'))
  with check (asc_role() in ('admin','manager','employee','reception'));
create policy "sets_delete" on storage_sets for delete to authenticated using (asc_is_admin());

-- Profiles: you can read your own row; admins read all. Only admins write, and
-- the owner guard above still blocks removing/demoting the owner.
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_write"  on profiles;
drop policy if exists "profiles_admin_write" on profiles;
create policy "profiles_select" on profiles for select to authenticated
  using (id = auth.uid() or asc_is_admin());
create policy "profiles_admin_write" on profiles for all to authenticated
  using (asc_is_admin()) with check (asc_is_admin());

-- Allowed-emails invites: admins only.
alter table allowed_emails enable row level security;
drop policy if exists "allowed_admin_all" on allowed_emails;
create policy "allowed_admin_all" on allowed_emails for all to authenticated
  using (asc_is_admin()) with check (asc_is_admin());

-- Audit log + backup runs: staff read; admins record backups.
drop policy if exists "audit_select" on audit_events;
create policy "audit_select" on audit_events for select to authenticated using (asc_role() <> 'readonly');
drop policy if exists "backup_select" on backup_runs;
drop policy if exists "backup_insert" on backup_runs;
create policy "backup_select" on backup_runs for select to authenticated using (asc_role() <> 'readonly');
create policy "backup_insert" on backup_runs for insert to authenticated with check (asc_is_admin());

-- Condition-photo objects: staff only (best-effort; skipped if storage DDL is restricted).
do $$
begin
  execute 'drop policy if exists "tire-photos auth read"   on storage.objects';
  execute 'drop policy if exists "tire-photos auth write"  on storage.objects';
  execute 'drop policy if exists "tire-photos auth delete" on storage.objects';
  execute 'create policy "tire-photos auth read"   on storage.objects for select to authenticated using (bucket_id = ''tire-photos'' and public.asc_role() <> ''readonly'')';
  execute 'create policy "tire-photos auth write"  on storage.objects for insert to authenticated with check (bucket_id = ''tire-photos'' and public.asc_role() <> ''readonly'')';
  execute 'create policy "tire-photos auth delete" on storage.objects for delete to authenticated using (bucket_id = ''tire-photos'' and public.asc_role() <> ''readonly'')';
exception when others then raise notice 'storage photo policies skipped: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- v4 — user management upgrades (idempotent, safe to re-run).
-- 1. Signups carry the person's name: the signup form and Google both put it in
--    auth metadata; handle_new_user() now reads it (allowlist name still wins).
-- 2. Admins see FULL emails in the directory (list_users gains an `email` column
--    that is null for non-admins; the masked column stays for them).
-- 3. Everyone can state/correct their OWN display name (and nothing else) via
--    set_my_name() — profile writes are otherwise admin-only under RLS.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger as $$
declare
  v_email   text := lower(coalesce(new.email, ''));
  v_pending public.allowed_emails%rowtype;
  v_role    text;
  v_name    text;
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;

  if v_email = lower(public.asc_owner_email()) then
    v_role := 'admin';
  else
    select * into v_pending from public.allowed_emails where email = v_email;
    if found then
      v_role := coalesce(v_pending.role, 'employee');
      v_name := v_pending.full_name;
    elsif first_user then
      v_role := 'admin';
    else
      v_role := 'readonly';
    end if;
  end if;

  -- The signup form / Google supply the name in auth metadata.
  v_name := coalesce(v_name,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name',
                         new.raw_user_meta_data->>'name', '')), ''));

  -- Never let a profile-write problem abort the auth-user insert (see v3 note).
  begin
    insert into public.profiles (id, email, full_name, role)
      values (new.id, new.email, v_name, v_role)
      on conflict (id) do nothing;
    delete from public.allowed_emails where email = v_email;
  exception when others then
    raise notice 'handle_new_user: profile write skipped for %: %', v_email, sqlerrm;
  end;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Return type changes (new `email` column), so the old function must go first.
drop function if exists public.list_users();
create function public.list_users()
returns table (id uuid, full_name text, role text, email text, email_masked text, is_owner boolean) as $$
  select
    p.id,
    p.full_name,
    p.role,
    case when asc_is_admin() then p.email else null end as email,
    case when coalesce(p.email,'') = '' then ''
         else left(p.email, 1)
              || repeat('*', greatest(char_length(split_part(p.email,'@',1)) - 1, 0))
              || case when position('@' in p.email) > 0 then '@' || split_part(p.email,'@',2) else '' end
    end as email_masked,
    lower(coalesce(p.email,'')) = lower(public.asc_owner_email()) as is_owner
  from public.profiles p
  where asc_role() <> 'readonly'
  order by (lower(coalesce(p.email,'')) = lower(public.asc_owner_email())) desc,
           p.full_name nulls last, p.email;
$$ language sql stable security definer set search_path = public, pg_temp;

grant execute on function list_users() to authenticated;

-- "State your name": any signed-in user may set their own full_name — nothing
-- else. SECURITY DEFINER because profile writes are admin-only under RLS; the
-- function body is the entire privilege.
create or replace function public.set_my_name(new_name text) returns void as $$
declare v text := left(trim(coalesce(new_name, '')), 120);
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if v = '' then raise exception 'Name is required.'; end if;
  update public.profiles set full_name = v where id = auth.uid();
  if not found then
    insert into public.profiles (id, email, full_name, role)
      values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), v, 'readonly')
      on conflict (id) do update set full_name = excluded.full_name;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;

-- ============================================================================
-- v5 — extra intake fields captured on the paper "Nalog za izdavanje" that we
-- didn't track yet (idempotent, safe to re-run; existing rows untouched):
--   • customer ADDRESS (for the printed customer order),
--   • vehicle VIN / chassis number (Br. šas.),
--   • wheel-BOLT location — stored with us vs left in the customer's trunk,
--   • whether the HUBCAPS (poklopci kotača) are stored.
-- ============================================================================
alter table customers    add column if not exists address text;
alter table vehicles     add column if not exists vin text;
alter table storage_sets add column if not exists bolts_location text;   -- null | 'stored' | 'in_trunk'
alter table storage_sets add column if not exists hubcaps_stored boolean not null default false;
create index if not exists idx_vehicles_vin on vehicles(vin);

-- Done. Next: Authentication -> Users -> add your shop login (first user = admin).
