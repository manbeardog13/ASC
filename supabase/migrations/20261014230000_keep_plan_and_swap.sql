-- Seasonal swap booking. Nullable, so existing sets stay as they are.
-- keep_plan: seasonal | season_keep | indefinite | discard
-- swap_at: the bay time. The same fact is also written into notes as
-- [[asc-plan …]] so the app can read it before this migration is applied.

alter table public.storage_sets add column if not exists keep_plan text;
alter table public.storage_sets add column if not exists swap_at timestamptz;

create index if not exists idx_sets_swap_at on public.storage_sets (swap_at)
  where swap_at is not null and deleted_at is null;
