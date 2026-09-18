param(
    [string]$EnvFile = (Join-Path $PSScriptRoot ".env.prod")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Không tìm thấy production env file: $EnvFile"
}

$values = [System.Collections.Generic.Dictionary[string, string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)

foreach ($line in Get-Content -LiteralPath $EnvFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -eq 2) {
        $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
}

function Require-Secret([string]$Name, [int]$MinimumLength = 16) {
    $value = if ($values.ContainsKey($Name)) { $values[$Name] } else { "" }
    if ([string]::IsNullOrWhiteSpace($value) -or
        $value -match '^CHANGE_ME' -or
        $value -match '^dev-' -or
        $value.Length -lt $MinimumLength) {
        throw "$Name chưa được cấu hình bằng secret production hợp lệ"
    }
}

foreach ($name in @(
    "NOTIFICATION_INTERNAL_API_KEY", "RABBITMQ_PASSWORD", "REDIS_PASSWORD",
    "IDENTITY_DB_PASSWORD", "HOTEL_DB_PASSWORD", "BOOKING_DB_PASSWORD",
    "PAYMENT_DB_PASSWORD", "NOTIFICATION_DB_PASSWORD", "CHAT_DB_PASSWORD",
    "EKYC_INTERNAL_API_KEY", "EKYC_TOKEN_SECRET"
)) {
    Require-Secret $name
}

Require-Secret "JWT_SECRET" 32
try {
    $jwtBytes = [Convert]::FromBase64String($values["JWT_SECRET"])
} catch {
    throw "JWT_SECRET phải là Base64 hợp lệ"
}
if ($jwtBytes.Length -lt 32) {
    throw "JWT_SECRET phải giải mã thành ít nhất 32 byte"
}

$publicUrl = if ($values.ContainsKey("PUBLIC_WEB_URL")) { $values["PUBLIC_WEB_URL"] } else { "" }
if ($publicUrl -notmatch '^https://[^/]+') {
    throw "PUBLIC_WEB_URL production phải là URL HTTPS tuyệt đối"
}

if ($values["PAYOS_ENABLED"] -match '^(?i:true|1|yes)$') {
    Require-Secret "PAYOS_CLIENT_ID" 4
    Require-Secret "PAYOS_API_KEY"
    Require-Secret "PAYOS_CHECKSUM_KEY"
}

if ($values["PAYOS_PAYOUT_ENABLED"] -match '^(?i:true|1|yes)$') {
    throw "PAYOS_PAYOUT_ENABLED phải giữ false cho production hiện tại"
}

Write-Host "Production environment validation passed (secret values were not printed)." -ForegroundColor Green
