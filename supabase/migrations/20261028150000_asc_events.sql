-- DRAFT: independent SQL and rollback review required before production apply.
-- Client-reported activity is advisory, not an atomic business audit.
begin;
create table public.asc_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid not null default auth.uid(),
  kind text not null check (kind in ('checkin','checkout','move','print','login')),
  entity text not null check (entity in ('set','session')),
  entity_id text not null check (char_length(entity_id) between 1 and 128),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192)
);
create index asc_events_at_idx on public.asc_events (at desc, id);
create index asc_events_entity_idx on public.asc_events (entity, entity_id, at desc);
alter table public.asc_events enable row level security;
revoke all on public.asc_events from public, anon, authenticated, service_role;
grant select on public.asc_events to authenticated;
-- Server-generated id and timestamp cannot be spoofed by client inserts.
grant insert (actor,kind,entity,entity_id,payload) on public.asc_events to authenticated;
create policy asc_events_read on public.asc_events for select to authenticated
  using (public.asc_role() in ('admin','manager','employee','reception'));
create policy asc_events_append on public.asc_events for insert to authenticated
  with check (actor = auth.uid() and public.asc_role() in ('admin','manager','employee','reception'));
-- No update/delete/truncate grant or policy; no privileged writer introduced.
comment on table public.asc_events is 'Append-only client-reported activity; incomplete and not transactionally coupled to operational writes.';
commit;
