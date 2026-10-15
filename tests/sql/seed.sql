-- Rows the location exercise expects. Loaded after schema.sql and before
-- the migrations, so the slot backfill has something to link.

insert into public.profiles (id, email, role)
values ('00000000-0000-0000-0000-000000000001', 'staff@example.com', 'employee')
on conflict (id) do nothing;

insert into public.customers (id, name) values ('10000000-0000-0000-0000-000000000001', 'Ana')
on conflict (id) do nothing;
insert into public.vehicles (id, customer_id, plate) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'DU-100-AA')
on conflict (id) do nothing;

insert into public.storage_sets (id, public_code, vehicle_id, zone, rack, shelf, slot, status, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', 'ASC-2026-0001', '20000000-0000-0000-0000-000000000001', 'A', '01', '1', '1', 'in_storage', now() - interval '2 days'),
  ('30000000-0000-0000-0000-000000000002', 'ASC-2026-0002', '20000000-0000-0000-0000-000000000001', 'A', '01', '1', '1', 'in_storage', now() - interval '1 day'),
  ('30000000-0000-0000-0000-000000000003', 'ASC-2026-0003', '20000000-0000-0000-0000-000000000001', null, null, null, null, 'in_storage', now()),
  ('30000000-0000-0000-0000-000000000004', 'ASC-2026-0004', '20000000-0000-0000-0000-000000000001', 'B', '02', '1', '4', 'in_storage', now())
on conflict (id) do nothing;
