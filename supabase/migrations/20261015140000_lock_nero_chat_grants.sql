-- Forward-only companion to 20261015050000_nero_chats.sql.
-- Supabase default privileges can include TRUNCATE, which bypasses row policies.
-- Preserve owner-scoped CRUD and remove anonymous / table-wide privileges.
revoke all on table public.nero_chats, public.nero_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.nero_chats, public.nero_messages to authenticated;
