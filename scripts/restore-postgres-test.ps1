[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('identity', 'hotel', 'booking', 'payment', 'notification', 'chat')]
    [string]$Service,

    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9_]*_restore_test$')]
    [string]$TargetDatabase
)

$ErrorActionPreference = 'Stop'

$databaseMap = @{
    identity     = @{ ComposeService = 'identity-postgres';     User = 'identity_user' }
    hotel        = @{ ComposeService = 'hotel-postgres';        User = 'hotel_user' }
    booking      = @{ ComposeService = 'booking-postgres';      User = 'booking_user' }
    payment      = @{ ComposeService = 'payment-postgres';      User = 'payment_user' }
    notification = @{ ComposeService = 'notification-postgres'; User = 'notification_user' }
    chat         = @{ ComposeService = 'chat-postgres';         User = 'chat_user' }
}

$backupPath = (Resolve-Path -LiteralPath $BackupFile).Path
if ([System.IO.Path]::GetExtension($backupPath) -ne '.dump') {
    throw 'BackupFile must be a custom-format .dump file created by backup-postgres.ps1.'
}

$mapping = $databaseMap[$Service]
$existing = & docker compose exec -T $mapping.ComposeService psql -U $mapping.User -d postgres `
    -tAc "SELECT 1 FROM pg_database WHERE datname='$TargetDatabase'"
if ($LASTEXITCODE -ne 0) {
    throw 'Could not check the target PostgreSQL instance.'
}
if (($existing | Out-String).Trim() -eq '1') {
    throw "Target database '$TargetDatabase' already exists. This script never overwrites or drops a database."
}

Write-Host "Creating isolated test database '$TargetDatabase'..."
& docker compose exec -T $mapping.ComposeService createdb -U $mapping.User $TargetDatabase
if ($LASTEXITCODE -ne 0) {
    throw "Could not create '$TargetDatabase'."
}

Write-Host "Restoring $backupPath into '$TargetDatabase'..."
$arguments = @(
    'compose', 'exec', '-T', $mapping.ComposeService,
    'pg_restore', '-U', $mapping.User, '-d', $TargetDatabase,
    '--no-owner', '--no-acl', '--exit-on-error'
)
$process = Start-Process -FilePath 'docker' -ArgumentList $arguments -NoNewWindow -Wait -PassThru `
    -RedirectStandardInput $backupPath
if ($process.ExitCode -ne 0) {
    throw "Restore failed. The isolated database '$TargetDatabase' was kept for diagnosis and was not deleted."
}

Write-Host "Restore completed. Verify row counts and application migrations before deleting the test database manually."
