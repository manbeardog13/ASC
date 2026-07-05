# ASC Tire Hotel — encrypted backups

AES-256 encrypted PostgreSQL dumps (`database_backups/db`) and CSV
inventory snapshots (`database_backups/csv`). They are encrypted because
this repository is public; the key lives only in the repo's Actions
secret `BACKUP_ENCRYPTION_KEY`. Restore steps: see
`docs/DISASTER_RECOVERY.md` on the main branch.
