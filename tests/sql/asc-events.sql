-- Disposable smoke database only. Never run against operational data.
\set ON_ERROR_STOP on
begin;
insert into public.profiles(id,email,role) values
 ('00000000-0000-0000-0000-000000000091','events-staff@example.test','employee'),
 ('00000000-0000-0000-0000-000000000092','events-readonly@example.test','readonly');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
set local role authenticated;
insert into public.asc_events(actor,kind,entity,entity_id,payload)
 values(auth.uid(),'print','set','synthetic-set','{"outcome":"failed"}');
do $$ begin
 if (select count(*) from public.asc_events where entity_id='synthetic-set') <> 1 then
   raise exception 'staff event not visible';
 end if;
 begin
   insert into public.asc_events(actor,kind,entity,entity_id)
    values('00000000-0000-0000-0000-000000000092','login','session','synthetic');
   raise exception 'actor spoof succeeded';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.asc_events(at,kind,entity,entity_id) values(now(),'login','session','synthetic');
   raise exception 'timestamp spoof succeeded';
 exception when insufficient_privilege then null; end;
 begin
   update public.asc_events set payload='{}' where entity_id='synthetic-set';
   raise exception 'update succeeded';
 exception when insufficient_privilege then null; end;
 begin
   delete from public.asc_events where entity_id='synthetic-set';
   raise exception 'delete succeeded';
 exception when insufficient_privilege then null; end;
 begin
   truncate public.asc_events;
   raise exception 'truncate succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
do $$ begin
 if exists(select 1 from public.asc_events) then raise exception 'readonly saw staff events'; end if;
 begin
   insert into public.asc_events(kind,entity,entity_id) values('login','session','synthetic');
   raise exception 'readonly inserted event';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.asc_events','SELECT') or
    has_any_column_privilege('anon','public.asc_events','INSERT') or
    has_table_privilege('service_role','public.asc_events','UPDATE') then
   raise exception 'unexpected inherited grants';
 end if;
end $$;
rollback;
