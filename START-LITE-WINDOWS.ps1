$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node .\scripts\start-local.mjs
if ($LASTEXITCODE -ne 0) { throw "Local start failed. No deployment was performed." }
