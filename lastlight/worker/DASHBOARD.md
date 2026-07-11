# Internal playtest dashboard

The dashboard is an operator-only, local static report generated from the identity-free
`lastlight_runs` Analytics Engine dataset. It is deliberately not an application route. Output
goes to `.lastlight-dashboard/`, which is gitignored and is never part of the `/lastlight`
deployment.

## Privacy boundary

- The Analytics SQL selects grouped sums only. It never selects raw run rows.
- `HAVING runs >= 5` suppresses small cohorts at the query boundary. The local validator enforces
  the same minimum again and refuses a lower setting.
- The report contains no callsign, player identity, replay seed/hash, resume token, squad code,
  room identifier, IP address, or raw event.
- The input schema rejects unknown fields and identity-like field names instead of silently
  dropping them.
- The HTML is static, `noindex`, contains no scripts, and is written with owner-only permissions
  where the host supports them.

The current `run.v1` dataset can show run count, win/defeat rate, average survival time and
duration, wave, level, kills, damage, revives, difficulty, build, and specialist presence.
Weapon selection, reconnect/network health, client errors/crashes, and death causes are not
collected. The report says so explicitly rather than inventing a proxy metric.

## Generate from Cloudflare

Create a Cloudflare API token with read access to Account Analytics, then run from the repository
root in PowerShell:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "<account-id>"
$env:CLOUDFLARE_API_TOKEN = "<read-only-token>"
npm run lastlight:dashboard -- --days 30 --min-cohort 5
Start-Process .lastlight-dashboard/report.html
```

The token is read from the environment only. It is never written to the report. `--days` is
restricted to 1–90 and `--min-cohort` cannot be lower than 5, so neither value is interpolated
into SQL without numeric bounds checks.

Use this command to inspect the exact query without making a request:

```powershell
npm run lastlight:dashboard -- --days 30 --min-cohort 5 --print-sql
```

## Fixture-backed development

Cloudflare access is not required to develop or verify the report:

```powershell
npm run lastlight:dashboard -- --fixture scripts/fixtures/lastlight-dashboard-aggregates.json
npm test -- --test-name-pattern="dashboard"
```

The fixture contains cohort totals, not raw runs. Do not add production exports or copied API
responses to the repository.
