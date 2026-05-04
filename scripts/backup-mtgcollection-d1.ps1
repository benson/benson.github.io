param(
  [string]$OutputRoot = "",
  [int]$RetentionDays = 90
)

$ErrorActionPreference = "Stop"

if (-not $OutputRoot) {
  if ($env:MTGCOLLECTION_BACKUP_DIR) {
    $OutputRoot = $env:MTGCOLLECTION_BACKUP_DIR
  } else {
    $OutputRoot = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "mtgcollection-backups"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$workerDir = Join-Path $repoRoot "mtgcollection\worker"
$backupDir = Join-Path $OutputRoot "d1"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outFile = Join-Path $backupDir "mtgcollection-sync-$stamp.sql"
$hashFile = "$outFile.sha256"

Push-Location $workerDir
try {
  npx wrangler d1 export mtgcollection-sync --remote --skip-confirmation --output $outFile
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler d1 export failed with exit code $LASTEXITCODE. Run 'npx wrangler login' and try again."
  }
} finally {
  Pop-Location
}

$item = Get-Item -LiteralPath $outFile
if ($item.Length -le 0) {
  throw "D1 export produced an empty file: $outFile"
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outFile
"$($hash.Hash.ToLowerInvariant())  $($item.Name)" | Set-Content -LiteralPath $hashFile -Encoding ascii

$latest = [ordered]@{
  database = "mtgcollection-sync"
  exportedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  file = $outFile
  bytes = $item.Length
  sha256 = $hash.Hash.ToLowerInvariant()
}
$latest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupDir "latest.json") -Encoding ascii

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $backupDir -Filter "mtgcollection-sync-*.sql*" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
}

Write-Host "MTG Collection D1 backup complete"
Write-Host "File: $outFile"
Write-Host "Bytes: $($item.Length)"
Write-Host "SHA256: $($hash.Hash.ToLowerInvariant())"
