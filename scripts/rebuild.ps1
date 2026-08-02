@'
$ErrorActionPreference = "Stop"

Write-Host "Rebuilding Smart Hotel Booking System..." -ForegroundColor Cyan

docker compose down
docker compose build
docker compose up -d

Write-Host ""
docker compose ps
'@ | Set-Content scripts\rebuild.ps1