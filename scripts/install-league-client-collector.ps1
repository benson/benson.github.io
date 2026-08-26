param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'Benson Homepage League Match Collector'
$installDirectory = Join-Path $env:PUBLIC 'BensonHomepage'
$installedCollector = Join-Path $installDirectory 'league-client-collector.js'
$installedLauncher = Join-Path $installDirectory 'league-client-collector.vbs'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $installedCollector) {
    Remove-Item -LiteralPath $installedCollector -Force
  }
  if (Test-Path -LiteralPath $installedLauncher) {
    Remove-Item -LiteralPath $installedLauncher -Force
  }
  Write-Host "Removed scheduled task '$taskName'."
  exit 0
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$gh = (Get-Command gh.exe -ErrorAction Stop).Source
$sourceCollector = Join-Path $PSScriptRoot 'league-client-collector.js'

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourceCollector -Destination $installedCollector -Force

$collectorArguments = @(
  ('"{0}"' -f $installedCollector)
  '--publish'
  '--scheduled'
  '--gh-executable'
  ('"{0}"' -f $gh)
  '--log-directory'
  ('"{0}"' -f $installDirectory)
) -join ' '

$collectorCommand = ('"{0}" {1}' -f $node, $collectorArguments).Replace('"', '""')
$launcher = @"
Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run("$collectorCommand", 0, True)
WScript.Quit exitCode
"@
Set-Content -LiteralPath $installedLauncher -Value $launcher -Encoding ascii

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$action = New-ScheduledTaskAction -Execute $wscript -Argument ('//B //NoLogo "{0}"' -f $installedLauncher)
$trigger = New-ScheduledTaskTrigger -Daily -At '8:00 PM'
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

Write-Host "Installed '$taskName'. It runs silently once per day at 8:00 PM while this Windows user is signed in."
