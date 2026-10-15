-- ============================================================================
-- ASC Tire Hotel — log of "Send to Toni & Nero" relays
-- ----------------------------------------------------------------------------
-- ADDITIVE. Not applied to production. Apply by hand with the asc-builder-relay
-- function after review. Smoke loads it only on a throwaway database.
--
-- Admins (asc_is_admin: admin or manager) can read the log. Inserts are limited
-- to the caller's own row. The webhook URL and key are not stored here.
-- ============================================================================

create table if not exists public.builder_relay_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  user_name text not null default '',
  page_url text not null default '',
  app_version text not null default '',
  body text not null default '',
  attachment_count integer not null default 0,
  status integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_builder_relay_log_recent
  on public.builder_relay_log (user_id, created_at desc);

alter table public.builder_relay_log enable row level security;

drop policy if exists builder_relay_log_admin on public.builder_relay_log;
create policy builder_relay_log_admin on public.builder_relay_log
  for all to authenticated
  using (public.asc_is_admin())
  with check (public.asc_is_admin() and user_id = auth.uid());

grant select, insert on public.builder_relay_log to authenticated;
