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

| Service | Port | Chức năng |
|---|---:|---|
| API Gateway | 8080 | Điểm truy cập chung |
| Identity Service | 8081 | Người dùng, đăng nhập, JWT |
| Hotel Service | 8082 | Khách sạn và phòng |
| Booking Service | 8083 | Đặt phòng và Booking Hold |
| Payment Service | 8084 | Thanh toán và VNPay |
| Notification Service | 8085 | Email và thông báo |
| AI Service | 8086 | Gemini AI |

## Khởi động

```powershell
.\scripts\start.ps1