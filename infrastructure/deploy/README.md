# EnziuRooms Production Deploy

Bộ này không thay `docker-compose.yml` local hiện tại.

## Cài vào repo

Copy nguyên thư mục `infrastructure/deploy` vào:
`D:\Smart-Hotel-Booking-System\infrastructure\deploy`

## Chuẩn bị env

```powershell
Copy-Item infrastructure\deploy\.env.prod.example infrastructure\deploy\.env.prod
```

Điền secret/API key thật trong `.env.prod`. Không commit file này.

## Chạy thử production trên máy hiện tại

```powershell
cd D:\Smart-Hotel-Booking-System
.\infrastructure\deploy\deploy.ps1
```

Mở:
`http://localhost`

## Khi có VPS

Clone repo lên VPS, tạo `.env.prod`, rồi chạy:

```bash
chmod +x infrastructure/deploy/deploy.sh
./infrastructure/deploy/deploy.sh
```

Kiến trúc:
Internet -> Nginx -> frontend-prod
                 -> /api/* -> api-gateway -> microservices

Lưu ý: compose gốc hiện còn publish các port DB/backend để phục vụ local.
Khi lên server thật, cần firewall chỉ mở 80/443 hoặc harden compose production
để không public 5433-5438, 6379, 5672, 8080-8088.
