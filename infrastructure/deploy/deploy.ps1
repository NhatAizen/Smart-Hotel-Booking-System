$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $ProjectRoot
$EnvFile = "infrastructure\deploy\.env.prod"

if (-not (Test-Path $EnvFile)) {
    Write-Host "Thiếu $EnvFile" -ForegroundColor Red
    exit 1
}

docker compose `
  -f docker-compose.yml `
  -f infrastructure/deploy/docker-compose.prod.yml `
  --env-file $EnvFile `
  up -d --build

docker compose `
  -f docker-compose.yml `
  -f infrastructure/deploy/docker-compose.prod.yml `
  --env-file $EnvFile `
  ps
