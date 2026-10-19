-- The listed tables currently inherit table-wide privileges from Supabase
-- defaults. RLS does not apply to TRUNCATE. Preserve every existing CRUD grant,
-- role, policy, function and owner setting; remove only these unused privileges.
revoke truncate, references, trigger on table
  public.audit_events,
  public.allowed_emails,
  public.backup_runs,
  public.builder_relay_log,
  public.customers,
  public.locations,
  public.photos,
  public.profiles,
  public.set_movements,
  public.storage_sets,
  public.tires,
  public.vehicles
from public, anon, authenticated;

-- The existing policy permits admins/managers to SELECT all relay rows and
-- INSERT their own. Inherited UPDATE/DELETE grants accidentally made the audit
-- trail mutable despite its intended SELECT/INSERT interface.
-- Keep existing SELECT/INSERT grants, RLS policies and admin boundaries intact.
revoke update, delete on table public.builder_relay_log
from public, anon, authenticated;
