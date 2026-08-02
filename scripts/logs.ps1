@'
$ErrorActionPreference = "Stop"

docker compose logs -f --tail=200
'@ | Set-Content scripts\logs.ps1