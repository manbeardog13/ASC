-- DISPOSABLE smoke database only, after occupancy synchronization migration.
-- Exercises the exact explicit "restore without a slot" recovery write.
\set ON_ERROR_STOP on
begin;
insert into public.profiles(id,email,role)
values ('00000000-0000-0000-0000-000000000081','restore-unplaced@example.test','employee');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
set local role authenticated;
insert into public.locations(id,warehouse,zone,rack,shelf,slot,status) values
 ('76200000-0000-0000-0000-000000000001','restore-fixture','A','1','1','1','free'),
 ('76200000-0000-0000-0000-000000000002','restore-fixture','B','1','1','1','blocked');
insert into public.storage_sets(id,public_code,location_id,deleted_at,zone,rack,shelf,slot) values
 ('75200000-0000-0000-0000-000000000001','ASC-2099-9721','76200000-0000-0000-0000-000000000001',now(),'A','1','1','1'),
 ('75200000-0000-0000-0000-000000000003','ASC-2099-9723','76200000-0000-0000-0000-000000000002',now(),'B','1','1','1');
insert into public.storage_sets(id,public_code)
values ('75200000-0000-0000-0000-000000000002','ASC-2099-9722');
select public.place_set('75200000-0000-0000-0000-000000000002',null,'76200000-0000-0000-0000-000000000001',null);

do $$ declare changed integer; begin
 begin
   update public.storage_sets set deleted_at=null where id='75200000-0000-0000-0000-000000000001';
   raise exception 'ordinary restore must reject the occupied slot';
 exception when unique_violation then null;
 end;
 update public.storage_sets
    set deleted_at=null,location_id=null,zone=null,rack=null,shelf=null,slot=null
  where id='75200000-0000-0000-0000-000000000001' and deleted_at is not null;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'explicit restore did not restore one recycled set'; end if;
 if (select status from public.locations where id='76200000-0000-0000-0000-000000000001') <> 'occupied' or
    (select location_id from public.storage_sets where id='75200000-0000-0000-0000-000000000002') is distinct from '76200000-0000-0000-0000-000000000001'::uuid then
   raise exception 'unplaced recovery displaced the occupying set';
 end if;
 -- A second stale tab cannot repeat recovery or clear a newly chosen location.
 update public.storage_sets
    set deleted_at=null,location_id=null,zone=null,rack=null,shelf=null,slot=null
  where id='75200000-0000-0000-0000-000000000001' and deleted_at is not null;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'stale recovery repeated a completed restore'; end if;

 begin
   update public.storage_sets set deleted_at=null where id='75200000-0000-0000-0000-000000000003';
   raise exception 'ordinary restore must reject the blocked slot';
 exception when check_violation then null;
 end;
 update public.storage_sets
    set deleted_at=null,location_id=null,zone=null,rack=null,shelf=null,slot=null
  where id='75200000-0000-0000-0000-000000000003' and deleted_at is not null;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'blocked-slot recovery did not restore the set'; end if;
 if (select status from public.locations where id='76200000-0000-0000-0000-000000000002') <> 'blocked' then
   raise exception 'unplaced recovery unblocked a staff-blocked slot';
 end if;
 if exists (
   select 1 from public.storage_sets
    where id in ('75200000-0000-0000-0000-000000000001','75200000-0000-0000-0000-000000000003')
      and (deleted_at is not null or location_id is not null or zone is not null or rack is not null or shelf is not null or slot is not null)
 ) then raise exception 'explicit recovery retained stale placement fields'; end if;
end $$;
reset role;
rollback;
