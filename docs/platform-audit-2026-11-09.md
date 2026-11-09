# Rà soát EnziuRooms — 09/11/2026

## Đã sửa và triển khai
- API, websocket realtime và luồng cập nhật phòng trống: khi thiếu cấu hình API, production dùng cùng tên miền (/api), không quay về localhost.
- Trang chủ local dùng cùng API đã cấu hình với phần còn lại, bỏ nhánh lấy dữ liệu web production.
- Sửa cấu hình test đối soát đổi phòng để dùng H2 riêng; giữ nguyên cơ chế chặn test truy cập database production. Chạy lại 7 bài đạt.

## Kết quả
- 587 bài Java đạt cộng dồn qua các lượt chạy: 550 bài thường (gồm 7 bài đối soát chạy lại), 27 bài tích hợp trước đây bỏ qua và 10 bài realtime mới. Không phải một lượt full-suite duy nhất.
- 29 bài frontend, 28 bài semantic và 25 bài eKYC đạt. Lint frontend và build đạt.
- 10 tuyến công khai/bảo vệ đăng nhập tải được; trang quản trị không đăng nhập chuyển về /login.
- Trang chi tiết khách sạn được kiểm tra không ghi nhận lỗi JavaScript, API 5xx hoặc ảnh hỏng.
- Các container dịch vụ đang hoạt động, có healthcheck đều healthy tại thời điểm kiểm tra.
- Đã chạy đủ 27 bài tích hợp với PostgreSQL, Redis và RabbitMQ riêng: migration, giá theo ngày, xử lý đồng thời, chống nhận sự kiện trùng và đối soát đổi phòng. Đối chiếu XML Surefire xác nhận không fail/error/skip.
- Realtime: 10 bài đạt về JWT, sự kiện riêng theo người dùng/vai trò, sự kiện công khai và kết nối hỏng. Đây là kiểm thử thành phần; chưa phải WebSocket end-to-end qua reverse proxy.
- Trình duyệt: 12 trường hợp phân quyền (khách chưa đăng nhập và ba vai trò), trang admin phê duyệt loại phòng (Hủy, API lỗi, thử lại, cập nhật danh sách), hotel-admin hoàn tất vệ sinh (Hủy, xác nhận, cập nhật phòng) đều đạt. Dùng component thật với auth/API giả lập, không phải tài khoản production.
- Chạy lại luồng khách hàng đăng ký đối tác: gửi lại hồ sơ cá nhân/doanh nghiệp bị từ chối, xác minh mới, tài liệu mới, popup Hủy/Escape/xác nhận và chặn gửi khi PENDING đều đạt.
- Quét mã frontend không còn lời gọi alert/confirm/prompt nguyên bản; các chuỗi javascript:alert trong test bảo mật không phải lời gọi giao diện.

## Môi trường và khả năng chạy lại
- Script artifacts/run-integration-gates.ps1 tạo tài nguyên riêng, dùng cổng loopback, tài khoản ci_ và database _ci; không dùng database/broker production.
- Đã sửa lỗi riêng của runner: lệnh kiểm tra RabbitMQ phải chạy bằng user rabbitmq để tránh tạo .erlang.cookie thuộc root trong lúc broker khởi động. Runner kiểm tra sẵn sàng, báo thất bại nếu nhóm test lỗi và dọn container của chính nó.
- Chạy `python artifacts/verify-integration-gates.py` để đối chiếu số testcase thực thi và không bỏ qua. Bằng chứng: integration-executed-evidence.json.
- Đợt bổ sung này chỉ thêm kiểm thử và script; không phát sinh thay đổi nghiệp vụ cần triển khai lại.

## Chưa xác minh đầy đủ
- Chưa thực hiện toàn bộ nghiệp vụ qua trình duyệt với tài khoản từng vai trò, chưa thanh toán ngân hàng thật và chưa kiểm thử lại CCCD thật.
- Không thể kết luận toàn hệ thống không còn lỗi chỉ từ phạm vi này.

Chi tiết máy đọc: platform-audit-results.json. Log từng bộ nằm trong artifacts/audit-*.log.
