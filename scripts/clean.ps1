@'
$ErrorActionPreference = "Stop"

Write-Host "Stopping containers and removing build artifacts..." -ForegroundColor Yellow

docker compose down

Get-ChildItem services -Recurse -Directory -Filter target |
    Remove-Item -Recurse -Force

if (Test-Path frontend\node_modules) {
    Remove-Item frontend\node_modules -Recurse -Force
}

if (Test-Path frontend\dist) {
    Remove-Item frontend\dist -Recurse -Force
}

Write-Host "Clean completed." -ForegroundColor Green
'@ | Set-Content scripts\clean.ps1