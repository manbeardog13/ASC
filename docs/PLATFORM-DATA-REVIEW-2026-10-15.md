# ASC database and recovery review — 2026-10-15

Status: draft; no production change made by this review. Apply only with Toni's explicit approval, only to ASC `ilnqhlrvchuvpjgptjfx`.

## Confirmed defects and corrections

- Recycling or purging a set left its slot occupied. The forward occupancy migration synchronizes derived slot status atomically for insert, move, checkout, recycle, restore and purge. Restoring into a blocked or already occupied slot fails without changing the set. Blocked slots remain blocked.
- Browser roles inherited unused TRUNCATE, REFERENCES and TRIGGER privileges on 12 public tables. The forward grants migration removes only those privileges, plus UPDATE/DELETE on the intended append-only builder relay audit log. It preserves existing row-level policies and intended CRUD privileges. This finding does not imply a public REST truncate endpoint.
- Encrypted backups omitted locations and set movements. Both tables now participate in backup, schema recovery and completeness checks.
- Recovery drill embedded database-controlled set codes into privileged SQL. Quoted psql variables now treat codes as data. The disposable recovery fixture includes a malicious quoted code and checks that source and restored sentinel tables remain intact.

## Verification and installation

`bash scripts/smoke.sh` loads all migrations into disposable `asc_mig`, runs occupancy lifecycle and concurrent restore/place checks, verifies privilege and relay role boundaries, and executes the real encrypted backup/restore pipeline against two fresh local databases. The recovery fixture compares exact slot QR identities, occupancy links and movement endpoints. No production credentials are involved.

The occupancy migration takes a transactional NOWAIT write lock to install triggers and reconcile stale flags consistently. A busy warehouse causes a clean failure; retry the complete migration during a quiet interval. Do not remove the lock to force it through. It is a forward-only migration; do not alter previously applied files.

These scripts protect the existing customer/inventory backup scope. They do not back up Auth users or storage-object file bytes and are not proof of complete Supabase project recovery.

Owner transition, password settings, production DB application and relay deployment remain outside this change. The relay remains undeployed and Tailscale-only.

## Live ledger reconciliation


| Live ledger version/name | Repository migration |
| --- | --- |
| `20261014215005 locations_and_movements` | `20261014223000_locations_and_movements.sql` |
| `20261014215012 revoke_asc_audit_and_fix_set_updated_at` | `20261014223100_revoke_asc_audit_and_fix_set_updated_at.sql` |
| `20261015030827 owner_email_toni_nerosummit` | No corresponding migration on current main; owner work remains deferred. Do not replay or alter. |
| `20261015032014 keep_plan_and_swap` | `20261014230000_keep_plan_and_swap.sql` |
| `20261015040047 profiles_onboarded_at` | `20261015033000_profiles_onboarded_at.sql` |
| `20261015040053 lock_definer_functions` | `20261015033100_lock_definer_functions.sql` |
| `20261015043045 cluster_suggest_free_slot` | `20261015040000_cluster_suggest_free_slot.sql` |
| `20261015050539 builder_relay_log` | `20261015053000_builder_relay_log.sql` |
| `20261015135625 nero_chats_with_restricted_grants` | Combined `20261015050000_nero_chats.sql` + `20261015140000_lock_nero_chat_grants.sql` |

This is a name/feature mapping backed by current catalog checks, not a claim
that live migration statement bytes match repository files. Every repository
migration has a corresponding live feature. Never use the filename mismatch as
permission to replay the full schema/migration set.

Confirmed current state: all 14 public tables have RLS enabled; the two Nero
tables deny anon table access and deny authenticated TRUNCATE/REFERENCES/TRIGGER;
both private buckets remain private; placement RPCs are invoker functions with
authenticated EXECUTE and no anonymous EXECUTE. Trigger/admin definer helpers
are not executable by browser roles. The four remaining advisor notices for
authenticated definer helpers match their intended caller-scoped operations.

Remaining grant defect: the other 12 public tables have authenticated TRUNCATE,
REFERENCES and TRIGGER privileges; 10 also retain these for anon. Locations and
set_movements already deny anon. This is an effective SQL-privilege problem,
not evidence that PostgREST provides an anonymous TRUNCATE endpoint.

Independent operational defect: soft-delete and permanent-delete paths in
`js/db.js` do not synchronize `locations.status`; the live storage_sets table
has only updated_at and audit triggers. A formerly occupied slot can therefore
remain occupied after its set is recycled/purged and is filtered out by
`suggest_free_slot`. Repair via a separately reviewed forward migration with
transactional set/slot synchronization and disposable delete/restore/concurrency
coverage. Preserve blocked slots and occupied-slot uniqueness.

No generic security-policy changes are proposed. The leaked-password setting
remains disabled per the existing Toni-only handoff and is not changed here.
