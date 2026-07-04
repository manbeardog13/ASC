# Disaster Recovery — ASC Tire Hotel

> **Backup philosophy:** No single hardware failure, user mistake, service
> outage, or software bug should permanently destroy customer inventory data.

## Recovery objectives

| Metric | Target |
|---|---|
| **RPO** (max data loss) | ≤ 24 hours |
| **RTO** (time to restore service) | ≤ 1 hour |
| **Backup frequency** | Daily automatic (02:00 UTC) + on-demand |
| **Backup verification** | Weekly automated restore test (Mondays 03:00 UTC) |
| **Backup locations** | Supabase (primary) · encrypted `backups` branch · Actions artifacts |

## The layers

| Layer | What | Where | Recovers from |
|---|---|---|---|
| 1 | Live database | Supabase Postgres | — (primary) |
| 2 | **Encrypted daily dump** (`pg_dump` → gzip → AES-256) | `backups` branch → `database_backups/db/` + Actions artifact | DB corruption, dropped tables, provider loss |
| 3 | **Encrypted CSV snapshot** (human-readable once decrypted) | `backups` branch → `database_backups/csv/` + artifact | "the app is gone, I just need the list" |
| 4 | **Audit log** (`audit_events`, event-sourced) | Supabase | "who moved/deleted this set" |
| 5 | **Soft delete** (recycle bin, 30 days) | Supabase `storage_sets.deleted_at` | accidental deletes |
| 6 | **Weekly restore test** | GitHub Actions | silent backup rot |

Retention on the `backups` branch: **30 daily · 12 monthly · 5 yearly** (older
pruned automatically by `scripts/prune-backups.mjs`).

> **Why everything is encrypted:** the GitHub repo is *public*. Dumps and CSVs
> contain customer names, phones and plates, so they are AES-256 encrypted
> before they ever touch Git. The key lives **only** in a GitHub Actions secret,
> never in the repository. If you later make the repo private (or use a private
> backup repo), the encryption still applies — belt and braces.

---

## One-time setup (required for automatic backups)

Add two repository secrets — **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Project Settings → Database → Connection string → URI** (the **direct** connection, port 5432). Looks like `postgresql://postgres:PASSWORD@db.ilnqhlrvchuvpjgptjfx.supabase.co:5432/postgres` |
| `BACKUP_ENCRYPTION_KEY` | A long random passphrase **you generate and store somewhere safe** (a password manager). Losing it means losing the ability to decrypt backups. Generate one: `openssl rand -base64 40` |

Then merge this branch to `main` (scheduled workflows only run from the default
branch). The first backup runs that night, or trigger it now: **Actions →
Nightly backup → Run workflow**.

Also enable Supabase's own **daily backups / Point-in-Time-Recovery** (Project
Settings → Database → Backups) as the fastest first line of recovery.

---

## Restore procedures

You need the `BACKUP_ENCRYPTION_KEY` and a Postgres client (`psql`, `pg_dump`).

### Decrypt a backup

```bash
# Newest encrypted dump from the backups branch (database_backups/db/asc-YYYY-MM-DD.sql.gz.enc)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:"$BACKUP_ENCRYPTION_KEY" \
  -in asc-2026-07-04.sql.gz.enc | gunzip > asc-2026-07-04.sql

# CSV snapshot (opens in Excel)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:"$BACKUP_ENCRYPTION_KEY" \
  -in asc-2026-07-04.csv.enc > Inventory_2026-07-04.csv
```

### Full restore (RTO ≤ 1h)

1. Create a fresh Supabase project (or reuse the existing one if only data was lost).
2. Restore the decrypted dump:
   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f asc-2026-07-04.sql
   ```
   (The dump uses `--clean --if-exists`, so it drops and recreates cleanly.)
3. If it's a new project: run `supabase/schema.sql` for policies/roles, re-create
   the `tire-photos` bucket, update `js/config.js` with the new URL + anon key.
4. Confirm sign-in and that the dashboard shows the expected counts.

### Smart restore (one day / one set / one customer)

Restore the dump into a **throwaway** local database, then copy out only what you
need — never overwrite the whole live DB for a small fix.

```bash
# 1. Spin a scratch DB and load a chosen day's backup
docker run -d --name asc_scratch -e POSTGRES_PASSWORD=pw -p 5455:5432 postgres:16
psql "postgresql://postgres:pw@localhost:5455/postgres" -f asc-2026-07-04.sql

# 2a. One storage set back into production
pg_dump "postgresql://postgres:pw@localhost:5455/postgres" \
  --data-only --table=storage_sets \
  --where="public_code='ASC-2026-0042'" | psql "$SUPABASE_DB_URL"

# 2b. One customer (and cascade) — export the customer, their vehicles + sets + tires
#     filtered by customer id, then load into production. See the queries in this
#     folder's examples, or ask for a scoped extract.

docker rm -f asc_scratch   # tear the scratch DB down
```

### Undo an accidental delete (no backup needed)

- **Last 30 days:** the set is in the **Recycle bin** (in-app) — tap **Restore**.
- **Who did it:** open the set → **History**, or query `audit_events`
  (`select * from audit_events where set_code='ASC-2026-0042' order by at;`).

---

## Verification & monitoring

- The **weekly verify workflow** restores the newest dump into a disposable
  Postgres and checks the schema + row integrity. A failure emails you and writes
  a `failed` row to `backup_runs`.
- The app's **dashboard** shows **Last backup** (from `backup_runs`) so staff can
  see at a glance that protection is current.
- Do a **manual fire drill quarterly**: run *Nightly backup* → *Weekly
  verification* by hand, then decrypt the newest CSV and confirm it opens.

## If Supabase disappears entirely

Everything needed to rebuild is outside Supabase: application **code** on `main`,
**schema** in `supabase/schema.sql`, and **data** in the encrypted `backups`
branch. Stand up a new Supabase project, run the schema, restore the newest dump,
repoint `js/config.js`, and you're live again.
