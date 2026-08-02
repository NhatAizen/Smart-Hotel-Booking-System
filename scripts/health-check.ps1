@'
$services = @(
    @{ Name = "API Gateway"; Url = "http://localhost:8080/actuator/health" },
    @{ Name = "Identity Service"; Url = "http://localhost:8081/actuator/health" },
    @{ Name = "Hotel Service"; Url = "http://localhost:8082/actuator/health" },
    @{ Name = "Booking Service"; Url = "http://localhost:8083/actuator/health" },
    @{ Name = "Payment Service"; Url = "http://localhost:8084/actuator/health" },
    @{ Name = "Notification Service"; Url = "http://localhost:8085/actuator/health" },
    @{ Name = "AI Service"; Url = "http://localhost:8086/actuator/health" }
)

foreach ($service in $services) {
    try {
        $response = Invoke-RestMethod `
            -Uri $service.Url `
            -Method Get `
            -TimeoutSec 3

        Write-Host "$($service.Name): $($response.status)" -ForegroundColor Green
    }
    catch {
        Write-Host "$($service.Name): DOWN" -ForegroundColor Red
    }
}
'@ | Set-Content scripts\health-check.ps1