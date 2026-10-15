-- Disposable smoke database only. Synthetic users; no production mutations.
\set ON_ERROR_STOP on
begin;
insert into public.profiles (id, email, role) values
  ('00000000-0000-0000-0000-000000000071', 'chat-a@example.test', 'employee'),
  ('00000000-0000-0000-0000-000000000072', 'chat-b@example.test', 'employee');

do $$
declare t text; p text;
begin
  foreach t in array array['nero_chats', 'nero_messages'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'anonymous privilege % on %', p, t;
      end if;
    end loop;
    foreach p in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) then
        raise exception 'excess authenticated privilege % on %', p, t;
      end if;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('authenticated', 'public.' || t, p) then
        raise exception 'missing authenticated privilege % on %', p, t;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'nero-attachments' and public = false) then
    raise exception 'attachment bucket must be private';
  end if;
end $$;

-- The lightweight smoke Storage stub does not enable RLS; production Storage does.
alter table storage.objects enable row level security;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
set local role authenticated;
insert into public.nero_chats (id, title)
values ('70000000-0000-0000-0000-000000000001', 'Synthetic chat');
insert into public.nero_messages (chat_id, role, body)
values ('70000000-0000-0000-0000-000000000001', 'user', 'Synthetic message');
insert into storage.objects (bucket_id, name)
values ('nero-attachments', '00000000-0000-0000-0000-000000000071/test.png');
do $$ begin
  if (select count(*) from public.nero_chats) <> 1 or
     (select count(*) from public.nero_messages) <> 1 then
    raise exception 'owner cannot read own conversation';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'nero-attachments') <> 1 then
    raise exception 'owner cannot read own attachment';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', true);
do $$ declare n integer; begin
  if exists (select 1 from public.nero_chats) or exists (select 1 from public.nero_messages) then
    raise exception 'another user can read conversation';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'nero-attachments') then
    raise exception 'another user can read attachment';
  end if;
  update public.nero_chats set title = 'forbidden';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'another user can update conversation'; end if;
  delete from public.nero_messages;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'another user can delete messages'; end if;
  begin
    insert into public.nero_messages (chat_id, role, body)
    values ('70000000-0000-0000-0000-000000000001', 'user', 'forbidden');
    raise exception 'another user can append messages';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.nero_chats (user_id, title)
    values ('00000000-0000-0000-0000-000000000071', 'forbidden');
    raise exception 'user can impersonate a conversation owner';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('nero-attachments', '00000000-0000-0000-0000-000000000071/forbidden.png');
    raise exception 'another user can write attachment';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
update public.nero_chats set title = 'Updated';
delete from public.nero_chats;
do $$ begin
  if exists (select 1 from public.nero_messages) then
    raise exception 'deleting own chat must cascade to own messages';
  end if;
end $$;
reset role;
rollback;
