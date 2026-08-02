@'
$ErrorActionPreference = "Stop"

Write-Host "Starting Smart Hotel Booking System..." -ForegroundColor Cyan

docker compose up -d --build

Write-Host ""
docker compose ps
'@ | Set-Content scripts\start.ps1