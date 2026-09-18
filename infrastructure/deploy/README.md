# Triển khai EnziuRooms

Bộ production dùng `docker-compose.yml` làm base và `docker-compose.prod.yml` làm lớp hardening. Compose local không bị thay đổi cách chạy.

## Chuẩn bị biến môi trường

```powershell
Copy-Item infrastructure\deploy\.env.prod.example infrastructure\deploy\.env.prod
```

Điền secret riêng cho môi trường. `JWT_SECRET` phải là Base64 giải mã được ít nhất 32 byte. Không commit `.env.prod`; file đã được git ignore.

`POSTGRES_PASSWORD` chỉ khởi tạo credential khi volume database còn mới. Với volume đã tồn tại, không đổi password bằng cách sửa `.env.prod` và không chạy `docker compose down -v`; hãy dùng quy trình rotate credential trong PostgreSQL rồi mới đồng bộ env.

Kiểm tra trước khi deploy:

```powershell
.\infrastructure\deploy\validate-prod-env.ps1
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml --env-file infrastructure/deploy/.env.prod config --quiet
```

Validator từ chối placeholder, secret quá ngắn, URL không dùng HTTPS và cấu hình PayOS bật nhưng thiếu key. Validator không in giá trị secret.

## Chạy

Windows:

```powershell
.\infrastructure\deploy\deploy.ps1
```

Linux:

```bash
chmod +x infrastructure/deploy/deploy.sh infrastructure/deploy/validate-prod-env.sh
./infrastructure/deploy/deploy.sh
```

Production overlay không publish PostgreSQL, Redis, RabbitMQ hoặc cổng 8080–8088. Chỉ reverse proxy publish cổng 80. Prometheus/Grafana là overlay riêng và chỉ bind loopback; xem `docs/observability.md`.

## TLS và reverse proxy

Nginx trong repository hiện chỉ nghe HTTP cổng 80. Repository **chưa tự cấp hoặc gia hạn chứng chỉ TLS**. Khi triển khai Internet cần đặt một TLS terminator bên ngoài (load balancer, Cloudflare, Caddy hoặc Nginx host có Certbot) phía trước container và chuyển `X-Forwarded-Proto: https` vào hệ thống. Firewall chỉ nên mở cổng mà TLS terminator thực sự sử dụng.

Không mô tả cấu hình hiện tại là HTTPS hoàn chỉnh nếu chưa có lớp TLS bên ngoài. PayOS webhook và OAuth callback production phải dùng URL HTTPS công khai thật.

## Dev, staging và production

- Dev: dùng compose gốc, cổng hạ tầng được publish để debug và có default dành cho local.
- Staging: dùng production overlay với bộ secret và dữ liệu riêng; không dùng chung database, OAuth callback hay PayOS credential với production.
- Production: dùng production overlay, TLS bên ngoài, backup theo lịch và giám sát metrics/log.

Quy trình phát hành phù hợp là chạy CI, deploy staging, kiểm tra migration và smoke test, sau đó mới promote cùng artifact sang production. Workflow hiện tại chỉ build/test/scan, chưa tự deploy và không chứa production secret.

## Kiểm tra sau deploy

```powershell
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml --env-file infrastructure/deploy/.env.prod ps
```

Xác nhận container healthy, đăng nhập thử, tạo luồng booking/payment sandbox, kiểm tra notification/realtime và kiểm tra target Prometheus. Với migration, chỉ thêm migration mới; không sửa migration đã chạy ở môi trường dùng chung.
