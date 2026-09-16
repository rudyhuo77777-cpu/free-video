$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (Test-Path ".env.local") {
  Get-Content ".env.local" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
    }
  }
}

$port = $env:AURIA_VOICE_BRIDGE_PORT
if (-not $port) { $port = "8787" }
Write-Host "Starting AURIA Local Voice Bridge on 127.0.0.1:$port" -ForegroundColor Green
Write-Host "Origin whitelist + pairing token are enabled. Voice is locked to F5 / id." -ForegroundColor Cyan
Write-Host "It will use SUPERTONIC_EXE if set, otherwise try PATH/common Python 3.13 locations." -ForegroundColor Cyan
node .\apps\voice-bridge\server.mjs
