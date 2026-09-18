[CmdletBinding()]
param(
    [string]$BackupRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups/postgres'),
    [ValidateRange(1, 3650)]
    [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'

$databases = @(
    @{ Service = 'identity-postgres';     Database = 'identity_db';     User = 'identity_user' },
    @{ Service = 'hotel-postgres';        Database = 'hotel_db';        User = 'hotel_user' },
    @{ Service = 'booking-postgres';      Database = 'booking_db';      User = 'booking_user' },
    @{ Service = 'payment-postgres';      Database = 'payment_db';      User = 'payment_user' },
    @{ Service = 'notification-postgres'; Database = 'notification_db'; User = 'notification_user' },
    @{ Service = 'chat-postgres';         Database = 'chat_db';         User = 'chat_user' }
)

$backupRootPath = [System.IO.Path]::GetFullPath($BackupRoot)
New-Item -ItemType Directory -Path $backupRootPath -Force | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmssZ')

foreach ($item in $databases) {
    $databaseDirectory = Join-Path $backupRootPath $item.Database
    New-Item -ItemType Directory -Path $databaseDirectory -Force | Out-Null
    $backupFile = Join-Path $databaseDirectory "$($item.Database)-$timestamp.dump"

    Write-Host "Backing up $($item.Database) from $($item.Service)..."
    $arguments = @(
        'compose', 'exec', '-T', $item.Service,
        'pg_dump', '-U', $item.User, '-d', $item.Database,
        '--format=custom', '--compress=6', '--no-owner', '--no-acl'
    )
    $process = Start-Process -FilePath 'docker' -ArgumentList $arguments -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $backupFile

    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $backupFile) -or
        (Get-Item -LiteralPath $backupFile).Length -eq 0) {
        if (Test-Path -LiteralPath $backupFile) {
            Remove-Item -LiteralPath $backupFile -Force
        }
        throw "Backup failed for $($item.Database) (exit code $($process.ExitCode))."
    }

    Write-Host "Created $backupFile"
}

$cutoff = (Get-Date).ToUniversalTime().AddDays(-$RetentionDays)
foreach ($item in $databases) {
    $databaseDirectory = Join-Path $backupRootPath $item.Database
    Get-ChildItem -LiteralPath $databaseDirectory -Filter "$($item.Database)-*.dump" -File |
        Where-Object { $_.LastWriteTimeUtc -lt $cutoff } |
        ForEach-Object {
            Write-Host "Removing expired backup $($_.FullName)"
            Remove-Item -LiteralPath $_.FullName -Force
        }
}

Write-Host "Backup completed. Retention: $RetentionDays days."
