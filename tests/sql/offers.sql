-- Offer RLS, status machine, and internal grants. Synthetic rows only.
\set ON_ERROR_STOP on

insert into public.profiles (id, email, full_name, role) values
  ('00000000-0000-0000-0000-0000000000aa', 'admin@example.com', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-0000000000bb', 'grant@example.com', 'Grant', 'employee'),
  ('00000000-0000-0000-0000-0000000000cc', 'plain@example.com', 'Plain', 'employee')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.email', 'staff@example.com', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;

-- A draft captures Ana and every set on her vehicle.
insert into public.offers (customer_name, phone, lines, terms, created_via)
values ('Ana', null, '[{"description":"Gume","qty":4,"unit_price":20,"entry_price":9,"source_name":"SECRET"}]'::jsonb, 'Uvjeti', 'manual');

do $$
declare
  v_id uuid;
  v_sets int;
  v_lines jsonb;
  v_name text;
begin
  select id, lines, customer_snapshot->>'name' into v_id, v_lines, v_name
    from public.offers where customer_name = 'Ana';
  if v_name <> 'Ana' then raise exception 'snapshot missed the saved customer'; end if;
  if v_lines::text ilike '%entry_price%' or v_lines::text ilike '%SECRET%' then
    raise exception 'buyer lines kept internal keys: %', v_lines;
  end if;
  select count(*) into v_sets from public.offer_related_sets where offer_id = v_id;
  if v_sets <> 4 then raise exception 'expected 4 related sets, got %', v_sets; end if;
  if exists (select 1 from public.offer_related_sets where offer_id = v_id and set_id is null) then
    raise exception 'related sets lost the live set id';
  end if;
end $$;

-- Staff cannot approve, and a draft cannot jump to sent.
do $$
declare v_id uuid;
begin
  select id into v_id from public.offers where customer_name = 'Ana';
  begin
    perform public.set_offer_status(v_id, 'approved');
    raise exception 'employee approved an offer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_offer_status(v_id, 'sent');
    raise exception 'draft was marked sent';
  exception when insufficient_privilege then null;
  end;
  if (select status from public.offers where id = v_id) <> 'draft' then
    raise exception 'status changed without an admin';
  end if;
end $$;

-- A direct status write does not stick.
do $$
declare v_id uuid;
begin
  select id into v_id from public.offers where customer_name = 'Ana';
  begin
    update public.offers set status = 'sent' where id = v_id;
    raise exception 'direct status update was accepted';
  exception when insufficient_privilege then null;
  end;
  if (select status from public.offers where id = v_id) <> 'draft' then
    raise exception 'direct update changed status';
  end if;
end $$;

-- Internal rows are invisible to staff without a grant.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.offer_internal;
  if v_n <> 0 then raise exception 'staff read internal rows'; end if;
  begin
    insert into public.offer_internal (offer_id, entry_price, source_name)
    select id, 10, 'SECRET' from public.offers where customer_name = 'Ana';
    raise exception 'staff inserted an internal row';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', false);
select set_config('request.jwt.claim.email', 'admin@example.com', false);
set role authenticated;

do $$
declare v_id uuid; v_by uuid;
begin
  select id into v_id from public.offers where customer_name = 'Ana';
  perform public.set_offer_status(v_id, 'approved');
  select approved_by into v_by from public.offers where id = v_id;
  if (select status from public.offers where id = v_id) <> 'approved' then
    raise exception 'admin approve failed';
  end if;
  if v_by is null then raise exception 'approved_by was not set'; end if;
  insert into public.offer_internal (offer_id, entry_price, source_name, internal_notes)
  values (v_id, 11, 'SECRET-SUPPLIER', 'staff note');
end $$;

-- anon cannot run the status RPC.
reset role;
set role anon;
do $$
begin
  begin
    perform public.set_offer_status('00000000-0000-0000-0000-0000000000aa', 'approved');
    raise exception 'anon called set_offer_status';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.email', 'staff@example.com', false);
set role authenticated;

-- After approval, the person who handed the offer over can mark it sent.
do $$
declare v_id uuid; v_n int;
begin
  select id into v_id from public.offers where customer_name = 'Ana';
  perform public.set_offer_status(v_id, 'sent');
  if (select status from public.offers where id = v_id) <> 'sent' then
    raise exception 'approved offer was not marked sent';
  end if;
  if (select approved_by from public.offers where id = v_id) is null then
    raise exception 'sent offer lost approved_by';
  end if;
  select count(*) into v_n from public.offer_internal;
  if v_n <> 0 then raise exception 'staff saw the internal row after approval'; end if;
end $$;

-- Grants: admin grants a colleague. That colleague still cannot hand out can_grant.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', false);
set role authenticated;
do $$ begin
  perform public.grant_offer_internal_access('00000000-0000-0000-0000-0000000000bb'::uuid, true);
  perform public.grant_offer_internal_access('00000000-0000-0000-0000-0000000000cc'::uuid, false);
end $$;

do $$
begin
  begin
    perform public.revoke_offer_internal_access('00000000-0000-0000-0000-0000000000aa'::uuid);
    raise exception 'admin was revoked';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000bb', false);
set role authenticated;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.offer_internal;
  if v_n <> 1 then raise exception 'granted user could not read internal data'; end if;
  begin
    perform public.grant_offer_internal_access('00000000-0000-0000-0000-000000000001'::uuid, true);
    raise exception 'non-admin handed out can_grant';
  exception when insufficient_privilege then null;
  end;
  perform public.grant_offer_internal_access('00000000-0000-0000-0000-000000000001'::uuid, false);
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.offer_internal_access_log where action = 'grant';
  if v_n < 2 then raise exception 'grant changes were not logged'; end if;
end $$;

-- A second draft still cannot skip approval.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000cc', false);
set role authenticated;
insert into public.offers (customer_name, lines) values ('Nitko', '[]'::jsonb);
do $$
declare v_id uuid;
begin
  select id into v_id from public.offers where customer_name = 'Nitko';
  begin
    perform public.set_offer_status(v_id, 'sent');
    raise exception 'unapproved offer reached sent';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Owner path: the trigger blocks sent without approved_by even for the table owner.
reset role;
do $$
declare v_id uuid;
begin
  select id into v_id from public.offers where customer_name = 'Nitko';
  begin
    perform set_config('asc.offer_status_rpc', '1', true);
    update public.offers set status = 'sent' where id = v_id;
    raise exception 'sent without approved_by';
  exception when insufficient_privilege then null;
  end;
  if (select status from public.offers where id = v_id) = 'sent' then
    raise exception 'row reached sent without approval';
  end if;
end $$;
