@'
# Smart Hotel Booking System

Hệ thống đặt phòng khách sạn thông minh được xây dựng theo kiến trúc Microservices.

## Công nghệ

- Java 17
- Spring Boot
- Spring Cloud Gateway
- Spring Security
- PostgreSQL
- Redis
- RabbitMQ
- React
- Docker Compose
- VNPay
- Gemini AI

## Microservices

| Service | Port |
|---|---:|
| API Gateway | 8080 |
| Identity Service | 8081 |
| Hotel Service | 8082 |
| Booking Service | 8083 |
| Payment Service | 8084 |
| Notification Service | 8085 |
| AI Service | 8086 |
| Realtime Service | 8087 |
| Chat Service | 8088 |
| eKYC Service | 8090 |

## Khởi động

```powershell
.\scripts\start.ps1