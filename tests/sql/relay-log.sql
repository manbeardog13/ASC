-- DISPOSABLE smoke database only, after both grant-hardening corrections.
\set ON_ERROR_STOP on
begin;

do $$ begin
 if has_table_privilege('anon','public.builder_relay_log','UPDATE') or
    has_table_privilege('anon','public.builder_relay_log','DELETE') or
    has_table_privilege('authenticated','public.builder_relay_log','UPDATE') or
    has_table_privilege('authenticated','public.builder_relay_log','DELETE') then
   raise exception 'relay audit log retains effective UPDATE/DELETE privileges';
 end if;
 if not has_table_privilege('authenticated','public.builder_relay_log','SELECT') or
    not has_table_privilege('authenticated','public.builder_relay_log','INSERT') then
   raise exception 'relay audit log lost its SELECT/INSERT interface';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.builder_relay_log'::regclass) then
   raise exception 'relay audit log RLS is disabled';
 end if;
end $$;

insert into public.profiles(id,email,role) values
 ('00000000-0000-0000-0000-000000000076','relay-admin-a@example.test','admin'),
 ('00000000-0000-0000-0000-000000000077','relay-admin-b@example.test','admin'),
 ('00000000-0000-0000-0000-000000000078','relay-staff@example.test','employee'),
 ('00000000-0000-0000-0000-000000000079','relay-readonly@example.test','readonly'),
 ('00000000-0000-0000-0000-000000000080','relay-manager@example.test','manager');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000076',true);
set local role authenticated;
insert into public.builder_relay_log(id,body) values ('78000000-0000-0000-0000-000000000001','Synthetic admin A record');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000077',true);
insert into public.builder_relay_log(id,body) values ('78000000-0000-0000-0000-000000000002','Synthetic admin B record');
do $$ begin
 if (select count(*) from public.builder_relay_log where id in ('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002')) <> 2 then
   raise exception 'admin cannot read the audit log across admins';
 end if;
 begin
   insert into public.builder_relay_log(user_id,body)
   values ('00000000-0000-0000-0000-000000000076','forbidden impersonated author');
   raise exception 'admin inserted a relay record as another user';
 exception when insufficient_privilege then null;
 end;
 begin
   update public.builder_relay_log set user_id=auth.uid(),body='forbidden rewrite'
    where id='78000000-0000-0000-0000-000000000001';
   raise exception 'admin rewrote another admin relay record';
 exception when insufficient_privilege then null;
 end;
 begin
   update public.builder_relay_log set body='forbidden own rewrite'
    where id='78000000-0000-0000-0000-000000000002';
   raise exception 'admin rewrote own relay record';
 exception when insufficient_privilege then null;
 end;
 begin
   delete from public.builder_relay_log where id='78000000-0000-0000-0000-000000000001';
   raise exception 'admin deleted relay audit history';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000080',true);
insert into public.builder_relay_log(id,body) values ('78000000-0000-0000-0000-000000000003','Synthetic manager record');
do $$ begin
 if (select count(*) from public.builder_relay_log where id in ('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000003')) <> 3 then
   raise exception 'manager lost its existing admin-equivalent audit access';
 end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000078',true);
do $$ begin
 if exists(select 1 from public.builder_relay_log) then
   raise exception 'employee can read relay audit history';
 end if;
 begin
   insert into public.builder_relay_log(body) values ('forbidden staff record');
   raise exception 'employee can insert relay audit records';
 exception when insufficient_privilege then null;
 end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000079',true);
do $$ begin
 if exists(select 1 from public.builder_relay_log) then
   raise exception 'readonly can read relay audit history';
 end if;
 begin
   insert into public.builder_relay_log(body) values ('forbidden readonly record');
   raise exception 'readonly can insert relay audit records';
 exception when insufficient_privilege then null;
 end;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 if exists(select 1 from public.builder_relay_log) then
   raise exception 'anonymous caller can read relay audit history';
 end if;
 begin
   insert into public.builder_relay_log(user_id,body)
   values ('00000000-0000-0000-0000-000000000076','forbidden anonymous record');
   raise exception 'anonymous caller can insert relay audit records';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
