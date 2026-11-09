param(
    [string]$BaseUrl = 'https://enziurooms.xyz',
    [string]$ReportPath = 'artifacts/chatbot/oauth-routing-verification.json'
)
$ErrorActionPreference='Stop'
$base=[Uri]$BaseUrl
if($base.Scheme -ne 'https' -or $base.IsLoopback -or $base.UserInfo -or $base.Query -or $base.Fragment) { throw 'Expected a public HTTPS origin' }
$origin=$base.GetLeftPart([UriPartial]::Authority)
$expected="$origin/oauth2/callback"
$container=docker inspect smart-hotel-identity-service | ConvertFrom-Json
if($LASTEXITCODE -ne 0) { throw 'Identity service unavailable' }
$runtime=@{}
$container.Config.Env | ForEach-Object {$entry=$_.Split('=',2);$runtime[$entry[0]]=$entry[1]}
if($runtime['OAUTH_FRONTEND_REDIRECT'] -ne $expected -or $runtime['FRONTEND_BASE_URL'] -ne $origin -or $runtime['PUBLIC_BASE_URL'] -ne $origin) { throw 'Identity public URL configuration does not match the frontend origin' }

$handler=[System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect=$false
$handler.UseCookies=$false
$client=[System.Net.Http.HttpClient]::new($handler)
$client.Timeout=[TimeSpan]::FromSeconds(25)
try {
    # Inspect only the first redirect. Never follow Google, store cookies, or print state/client credentials.
    $start=$client.GetAsync("$origin/oauth2/authorization/google").GetAwaiter().GetResult()
    $provider=$start.Headers.Location
    if([int]$start.StatusCode -ne 302 -or $provider.Host -ne 'accounts.google.com') { throw 'Google authorization route failed' }
    $query=@{}
    $provider.Query.TrimStart('?').Split('&') | ForEach-Object {
        $pair=$_.Split('=',2)
        if($pair.Length -eq 2) {$query[$pair[0]]=[Uri]::UnescapeDataString($pair[1])}
    }
    $googleCallback="$origin/login/oauth2/code/google"
    if($query['redirect_uri'] -ne $googleCallback) { throw 'Google callback origin is incorrect' }
    $failure=$client.GetAsync("$origin/login/oauth2/code/google?error=access_denied").GetAwaiter().GetResult()
    if([int]$failure.StatusCode -ne 302 -or $failure.Headers.Location.GetLeftPart([UriPartial]::Path) -ne $expected) { throw 'OAuth failure redirects away from the frontend' }
    $page=$client.GetAsync($expected).GetAwaiter().GetResult()
    if([int]$page.StatusCode -ne 200 -or $page.Content.Headers.ContentType.MediaType -ne 'text/html') { throw 'Frontend callback page unavailable' }
    # A deliberately nonexistent test code must be rejected; do not use a real login code.
    $body=[System.Net.Http.StringContent]::new('{"code":"invalid-routing-verification-code"}',[Text.Encoding]::UTF8,'application/json')
    $exchange=$client.PostAsync("$origin/api/auth/oauth2/exchange",$body).GetAwaiter().GetResult()
    if([int]$exchange.StatusCode -ne 400) { throw 'Code exchange route failed or accepted an invalid code' }
    $report=[pscustomobject]@{
        checkedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')
        identityImage=$container.Image
        googleAuthorizationStatus=[int]$start.StatusCode
        googleCallback=$googleCallback
        frontendCallback=$expected
        failureReturnsToPublicFrontend=$true
        callbackPageStatus=[int]$page.StatusCode
        invalidCodeRejected=$true
        realGoogleAccountLoginTested=$false
    }
    $report | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding utf8
    $report | ConvertTo-Json
} finally { $client.Dispose() }
