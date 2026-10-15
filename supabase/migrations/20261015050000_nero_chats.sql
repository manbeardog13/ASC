-- ============================================================================
-- ASC Tire Hotel — Nero chat history and private attachment bucket
-- ----------------------------------------------------------------------------
-- ADDITIVE. Not applied to the production project. Apply by hand after review.
-- Smoke loads this file only on a throwaway database.
--
-- Conversations belong to the signed-in user. Attachment bytes live in a
-- private bucket, one folder per user. This migration stores no tokens.
-- The builder relay logs on NERO-SERVER, not in a public table.
-- ============================================================================

create table if not exists public.nero_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nero_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.nero_chats(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  role text not null,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint nero_messages_role_chk check (role in ('user', 'assistant'))
);

create index if not exists idx_nero_chats_owner
  on public.nero_chats (user_id, updated_at desc);

create index if not exists idx_nero_messages_chat
  on public.nero_messages (chat_id, created_at);

alter table public.nero_chats enable row level security;
alter table public.nero_messages enable row level security;

drop policy if exists nero_chats_owner on public.nero_chats;
create policy nero_chats_owner on public.nero_chats
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists nero_messages_owner on public.nero_messages;
create policy nero_messages_owner on public.nero_messages
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.nero_chats c
      where c.id = chat_id and c.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.nero_chats c
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.nero_chats to authenticated;
grant select, insert, update, delete on public.nero_messages to authenticated;

insert into storage.buckets (id, name, public)
  values ('nero-attachments', 'nero-attachments', false)
  on conflict (id) do update set public = false;

drop policy if exists "nero-attachments owner read" on storage.objects;
create policy "nero-attachments owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nero-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
    and split_part(name, '/', 2) <> ''
    and split_part(name, '/', 3) = ''
  );

drop policy if exists "nero-attachments owner write" on storage.objects;
create policy "nero-attachments owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'nero-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
    and split_part(name, '/', 2) <> ''
    and split_part(name, '/', 3) = ''
  );

drop policy if exists "nero-attachments owner update" on storage.objects;
create policy "nero-attachments owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'nero-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'nero-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "nero-attachments owner delete" on storage.objects;
create policy "nero-attachments owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'nero-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );
