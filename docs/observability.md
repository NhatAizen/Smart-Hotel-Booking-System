# Observability cho EnziuRooms

## Phạm vi hiện tại

- Mỗi dịch vụ Spring xuất health tại `/actuator/health` và metrics tại `/actuator/prometheus`.
- Log console có thời gian, tên dịch vụ, mức log, logger và `correlationId`.
- API Gateway tạo hoặc chuẩn hóa header `X-Correlation-ID`; các dịch vụ tiếp tục truyền header này ở các lời gọi nội bộ chính.
- RabbitMQ realtime mang correlation ID trong message header để nối luồng HTTP với luồng bất đồng bộ.
- Prometheus và Grafana là overlay tùy chọn, chỉ bind vào loopback của máy chủ.

Endpoint metrics được mở cho mạng dịch vụ để Prometheus scrape. Trong production, các cổng dịch vụ không publish ra host và Nginx không route `/actuator/**`, vì vậy endpoint này không được công khai qua reverse proxy.

## Chạy local

Đặt mật khẩu Grafana trong biến môi trường, sau đó chạy từ thư mục gốc:

```powershell
$env:GRAFANA_ADMIN_PASSWORD = '<mat-khau-rieng>'
docker compose -f docker-compose.yml -f infrastructure/observability/docker-compose.observability.yml up -d prometheus grafana
```

- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`

Không commit mật khẩu Grafana. Trên máy chủ từ xa, nên truy cập qua SSH tunnel hoặc VPN thay vì đổi bind address thành `0.0.0.0`.

## Kiểm tra vận hành tối thiểu

1. Kiểm tra toàn bộ target ở trạng thái `UP` trong Prometheus.
2. Tạo dashboard cho request rate, tỷ lệ lỗi 5xx, latency p95, JVM heap, connection pool và RabbitMQ consumer failure.
3. Cảnh báo khi health thất bại, 5xx tăng, latency tăng kéo dài, database pool cạn hoặc DLQ realtime có message.
4. Khi điều tra lỗi, tìm cùng `X-Correlation-ID` qua gateway, service và consumer RabbitMQ.

## Log tập trung

Chưa đưa Loki/ELK vào compose mặc định. Docker hiện giữ log stdout/stderr và log đã có cấu trúc key-value đủ để collector đọc. Với một máy chủ nhỏ, bước tiếp theo phù hợp là Promtail hoặc Grafana Alloy gửi log sang Loki, đặt retention và giới hạn dung lượng. ELK chỉ nên chọn khi doanh nghiệp cần truy vấn toàn văn, pipeline biến đổi phức tạp và có đủ tài nguyên vận hành.
