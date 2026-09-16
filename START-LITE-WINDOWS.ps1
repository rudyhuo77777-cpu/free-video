$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\node_modules\.bin\wrangler.cmd")) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}

Write-Host "Building Free Video Lite..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed." }

Write-Host "Starting Cloudflare local preview..." -ForegroundColor Green
Write-Host "Wrangler will show the local URL (port 8790). Workers AI may require Cloudflare login and uses your Workers AI account." -ForegroundColor DarkGray
npx wrangler dev --port 8790
