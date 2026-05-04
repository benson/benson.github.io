param(
  [string]$BackupRoot = "",
  [int]$WarnBackupAgeHours = 30
)

$ErrorActionPreference = "Stop"

if (-not $BackupRoot) {
  if ($env:MTGCOLLECTION_BACKUP_DIR) {
    $BackupRoot = $env:MTGCOLLECTION_BACKUP_DIR
  } else {
    $BackupRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "mtgcollection-backups"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workerDir = Join-Path $repoRoot "mtgcollection\worker"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$message) {
  $failures.Add($message) | Out-Null
}

try {
  $site = Invoke-WebRequest "https://bensonperry.com/mtgcollection/?ops-check=1" -UseBasicParsing -TimeoutSec 20
  if ($site.StatusCode -ne 200) { Add-Failure "site returned HTTP $($site.StatusCode)" }
  if ($site.Content -notmatch "pk_live_") { Add-Failure "site did not include the live Clerk publishable key" }
} catch {
  Add-Failure "site check failed: $($_.Exception.Message)"
}

try {
  $res = $null
  try {
    $res = Invoke-WebRequest "https://mtgcollection-share.bensonperry.workers.dev/sync/bootstrap" `
      -Headers @{ Origin = "https://bensonperry.com" } `
      -UseBasicParsing `
      -TimeoutSec 20
    $statusCode = [int]$res.StatusCode
    $corsOrigin = $res.Headers["Access-Control-Allow-Origin"]
  } catch {
    if (-not $_.Exception.Response) { throw }
    $statusCode = [int]$_.Exception.Response.StatusCode
    $corsOrigin = $_.Exception.Response.Headers["Access-Control-Allow-Origin"]
  }
  if ($statusCode -ne 401) { Add-Failure "sync bootstrap expected 401 without token, got $statusCode" }
  if ($corsOrigin -ne "https://bensonperry.com") {
    Add-Failure "sync bootstrap CORS origin was not https://bensonperry.com"
  }
} catch {
  Add-Failure "worker check failed: $($_.Exception.Message)"
}

try {
  Push-Location $workerDir
  $infoText = npx wrangler d1 info mtgcollection-sync --json
  if ($LASTEXITCODE -ne 0) { throw "wrangler d1 info failed with exit code $LASTEXITCODE" }
  $info = $infoText | ConvertFrom-Json
  Write-Host "D1 info:"
  $info | ConvertTo-Json -Depth 6

  $countText = npx wrangler d1 execute mtgcollection-sync --remote --json --command "select 'sync_collections' as table_name, count(*) as rows from sync_collections union all select 'sync_ops', count(*) from sync_ops union all select 'sync_shares', count(*) from sync_shares;"
  if ($LASTEXITCODE -ne 0) { throw "wrangler d1 execute failed with exit code $LASTEXITCODE" }
  Write-Host "D1 table counts:"
  $countText
} catch {
  Add-Failure "D1 check failed: $($_.Exception.Message)"
} finally {
  Pop-Location
}

$backupDir = Join-Path $BackupRoot "d1"
$latest = Join-Path $backupDir "latest.json"
if (-not (Test-Path -LiteralPath $latest)) {
  Add-Failure "no latest backup metadata found at $latest"
} else {
  try {
    $meta = Get-Content -LiteralPath $latest -Raw | ConvertFrom-Json
    $backupTime = [DateTimeOffset]::Parse($meta.exportedAtUtc)
    $age = [DateTimeOffset]::UtcNow - $backupTime
    if ($age.TotalHours -gt $WarnBackupAgeHours) {
      Add-Failure "latest backup is $([Math]::Round($age.TotalHours, 1)) hours old"
    }
    if (-not (Test-Path -LiteralPath $meta.file)) {
      Add-Failure "latest backup file is missing: $($meta.file)"
    }
  } catch {
    Add-Failure "backup metadata check failed: $($_.Exception.Message)"
  }
}

if ($failures.Count) {
  Write-Error ("MTG Collection ops check failed:`n- " + ($failures -join "`n- "))
}

Write-Host "MTG Collection ops check passed"
