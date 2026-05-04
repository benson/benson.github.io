# MTG Collection Operations

This is the practical runbook for keeping collection sync recoverable. The goal
is ordinary resilience: avoid free-tier hard stops, keep backups, and make
failures obvious.

## Platform Limits

Before sharing the app beyond a tiny test group, upgrade the Cloudflare account
to Workers Paid. The main benefit is not performance; it changes quota failures
from hard daily stops into normal usage billing.

Relevant free-tier limits to watch:

- Workers Free: 100,000 requests per day.
- D1 Free: 5 million rows read per day.
- D1 Free: 100,000 rows written per day.
- D1 Free: 5 GB total storage.

If a free D1 daily limit is hit, D1 queries return errors until the daily reset.
The data should still be present, but new devices will not be able to bootstrap
from cloud sync until the service is available again.

## Nightly D1 Backups

Run the backup script from the repo root:

```powershell
.\scripts\backup-mtgcollection-d1.ps1
```

If Wrangler reports an authentication error during export, refresh the local
Cloudflare OAuth session and rerun the backup:

```powershell
npx wrangler login
.\scripts\backup-mtgcollection-d1.ps1
```

By default, backups are written outside the repo to:

```text
Documents\mtgcollection-backups\d1
```

Override the destination with:

```powershell
$env:MTGCOLLECTION_BACKUP_DIR = "D:\Backups\mtgcollection"
.\scripts\backup-mtgcollection-d1.ps1
```

Each backup writes:

- `mtgcollection-sync-YYYYMMDD-HHMMSS.sql`
- matching `.sha256` checksum
- `latest.json`

Do not commit these files to the public GitHub Pages repo. They contain user
collection data.

## Daily Health Check

Run:

```powershell
.\scripts\check-mtgcollection-ops.ps1
```

This checks:

- production page is reachable and has a live Clerk key
- Worker sync route is reachable and returns the expected unauthenticated 401
- D1 metadata can be read through Wrangler
- core D1 tables can be counted
- latest backup exists and is recent

## Restore Options

### Cloudflare D1 Time Travel

D1 Time Travel is the fastest restore path for recent mistakes. Cloudflare keeps
point-in-time recovery for the last 30 days.

Typical flow:

1. Identify the last known-good time.
2. In Cloudflare D1, use Time Travel to create or restore to that point.
3. Confirm the restored database has sane `sync_collections` and `sync_ops`
   counts before pointing production traffic at it.
4. Re-run `check-mtgcollection-ops.ps1`.

Wrangler also exposes D1 time-travel commands. Check the current CLI help before
running a destructive restore:

```powershell
npx wrangler d1 time-travel --help
```

### SQL Export Restore

If Time Travel is not enough, use a nightly SQL export.

Safer restore pattern:

1. Create a new D1 database.
2. Import the backup SQL into the new database.
3. Inspect row counts and a sample collection.
4. Update `wrangler.toml` to point at the restored database.
5. Deploy the Worker.

Example commands:

```powershell
npx wrangler d1 create mtgcollection-sync-restore
npx wrangler d1 execute mtgcollection-sync-restore --remote --file "C:\path\to\backup.sql"
```

## Account Linking Checks

Cloud collection ownership is keyed to Clerk's user ID. Before inviting testers,
verify that signing in with Google, GitHub, Discord, and email code lands the
same person on the expected Clerk user when the provider returns the same
verified email.

If a user signs in and sees an empty collection, first check whether Clerk
created a second user for them.

## Share Links

Signed-in share writes are permanent in KV. Unauthenticated legacy share writes
keep the old 30-day TTL.
