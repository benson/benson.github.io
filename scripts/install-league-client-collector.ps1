param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'Benson Homepage League Match Collector'
$installDirectory = Join-Path $env:LOCALAPPDATA 'BensonHomepage'
$installedCollector = Join-Path $installDirectory 'league-client-collector.js'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $installedCollector) {
    Remove-Item -LiteralPath $installedCollector -Force
  }
  Write-Host "Removed scheduled task '$taskName'."
  exit 0
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$gh = (Get-Command gh.exe -ErrorAction Stop).Source
$sourceCollector = Join-Path $PSScriptRoot 'league-client-collector.js'

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourceCollector -Destination $installedCollector -Force

$arguments = @(
  ('"{0}"' -f $installedCollector)
  '--publish'
  '--scheduled'
  '--gh-executable'
  ('"{0}"' -f $gh)
) -join ' '

$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -Hidden
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Collects Benson''s League match history while the League client is open and publishes normalized stats for bensonperry.com.' `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "Installed and started '$taskName'. It checks every five minutes while this Windows user is signed in."
