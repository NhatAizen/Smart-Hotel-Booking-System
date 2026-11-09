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

## Tăng tốc trợ lý bằng NVIDIA GPU nội bộ

Máy có NVIDIA GPU và Docker GPU runtime có thể thêm `docker-compose.gpu.yml`. Overlay dùng CUDA build 11913 cùng phiên bản với máy chủ CPU, giữ nguyên trọng số Qwen và mạng inference nội bộ. Ảnh CUDA được cố định bằng digest; không gọi dịch vụ AI bên ngoài. Cấu hình CPU trong compose gốc vẫn dùng được trên máy không có GPU.

Chỉ cập nhật ba dịch vụ trợ lý trên hệ thống đã chạy:

```powershell
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml -f infrastructure/deploy/docker-compose.gpu.yml --env-file infrastructure/deploy/.env.prod pull dialogue-model
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml -f infrastructure/deploy/docker-compose.gpu.yml --env-file infrastructure/deploy/.env.prod up -d --no-deps --no-build --pull never dialogue-model semantic-service ai-service
```

Giữ lớp GPU này trong các lệnh triển khai trợ lý tiếp theo để không vô tình quay lại ảnh CPU. Các lệnh trên không khởi động lại cơ sở dữ liệu, identity hay hotel-service. Dùng `nvidia-smi` và trạng thái health để kiểm tra GPU; thời gian thực tế được ghi trong `assistant_timing`/`dialogue_timing` mà không ghi nội dung hội thoại.

Tham khảo cấu hình CUDA của dự án: [llama.cpp Docker](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md).

## TLS và reverse proxy

Nginx trong repository hiện chỉ nghe HTTP cổng 80. Repository **chưa tự cấp hoặc gia hạn chứng chỉ TLS**. Khi triển khai Internet cần đặt một TLS terminator bên ngoài (load balancer, Cloudflare, Caddy hoặc Nginx host có Certbot) phía trước container và chuyển `X-Forwarded-Proto: https` vào hệ thống. Firewall chỉ nên mở cổng mà TLS terminator thực sự sử dụng.

Không mô tả cấu hình hiện tại là HTTPS hoàn chỉnh nếu chưa có lớp TLS bên ngoài. PayOS webhook và OAuth callback production phải dùng URL HTTPS công khai thật.

## Dev, staging và production

- Dev: dùng compose gốc, cổng hạ tầng được publish để debug và có default dành cho local.
- Staging: dùng production overlay với bộ secret và dữ liệu riêng; không dùng chung database, OAuth callback hay PayOS credential với production.
- Production: dùng production overlay, TLS bên ngoài, backup theo lịch và giám sát metrics/log.

Quy trình phát hành phù hợp là chạy CI, deploy staging, kiểm tra migration và smoke test, sau đó mới promote cùng artifact sang production. Workflow hiện tại chỉ build/test/scan, chưa tự deploy và không chứa production secret.

## Kiểm tra sau deploy

Khi dùng tên miền công khai, đặt `PUBLIC_MEDIA_BASE_URL=https://enziurooms.xyz/api/hotels/media` cho hotel-service để ảnh tải lên mới không mang URL localhost. Frontend chatbot cũng đưa các URL ảnh nội bộ cũ về `/api/hotels/media/...` qua cùng origin, nên không cần sửa hàng loạt bản ghi ảnh đã lưu. Cấu hình này chỉ là URL; không đổi volume chứa ảnh hoặc thông tin kết nối dữ liệu.

Frontend giữ các file JS/CSS có hash trong volume `frontend-assets` qua mỗi lần cập nhật để phiên đang mở vẫn tải được chunk của bản trước. Không xóa volume này khi thay container. HTML và script khôi phục dùng `Cache-Control: no-store`; URL `/assets/` không tồn tại phải trả 404, không trả HTML của SPA. Nếu dùng CDN, không tạo quy tắc ép cache HTML hoặc cache phản hồi 404 bất chấp header của origin.

CI kiểm tra cơ chế khôi phục bằng `node --test scripts/test-bootstrap-recovery.mjs` và chạy `scripts/test-frontend-assets.sh` trong ảnh frontend để xác nhận toàn bộ bundle được sao chép và bản trước vẫn còn sau hai lần khởi động. Sau triển khai cần mở trang chủ và `/hotels` bằng trình duyệt thực tế; chỉ nhận HTTP 200 chưa đủ xác nhận giao diện chạy được.

```powershell
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml --env-file infrastructure/deploy/.env.prod ps
```

Xác nhận container healthy, đăng nhập thử, tạo luồng booking/payment sandbox, kiểm tra notification/realtime và kiểm tra target Prometheus. Với migration, chỉ thêm migration mới; không sửa migration đã chạy ở môi trường dùng chung.
