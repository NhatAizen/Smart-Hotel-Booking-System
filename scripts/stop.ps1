@'
$ErrorActionPreference = "Stop"

Write-Host "Stopping Smart Hotel Booking System..." -ForegroundColor Yellow

docker compose down
'@ | Set-Content scripts\stop.ps1