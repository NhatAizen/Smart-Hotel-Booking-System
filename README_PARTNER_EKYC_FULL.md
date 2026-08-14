# EnziuRooms Partner eKYC — OCR + Liveness + Face Match

Bản này mở rộng luồng `CUSTOMER -> Đăng ký đối tác -> SYSTEM_ADMIN duyệt -> HOTEL_ADMIN` bằng một lớp eKYC tự host, không gọi API eKYC thương mại theo lượt.

## Luồng nghiệp vụ

1. Customer nhập thông tin hồ sơ và CCCD 12 số.
2. Upload CCCD mặt trước + mặt sau.
3. `identity-service` chạy Tesseract OCR và đối chiếu số CCCD, họ tên, ngày sinh.
4. Frontend mở camera bằng `getUserMedia()` và xin một challenge ngắn hạn từ backend.
5. Customer chụp 3 frame: nhìn thẳng + hai hướng quay đầu đối nghịch.
6. `ekyc-service` kiểm tra chất lượng ảnh, đúng một khuôn mặt, chuyển động/head-turn, frame không bị tái sử dụng, cùng một người trong các frame và face match với ảnh chân dung trên CCCD.
7. Chỉ khi `OCR + liveness + face match` cùng đạt, hồ sơ mới được lưu ở trạng thái `PENDING`.
8. System Admin vẫn là lớp duyệt cuối. Backend không cho approve hồ sơ chưa `ocr_verified=true` và `ekyc_verified=true`.
9. Khi approve, role đổi `CUSTOMER -> HOTEL_ADMIN` và refresh token bị revoke để người dùng đăng nhập lại lấy quyền mới.

## Kiến trúc

- `frontend`: camera UI, challenge flow và trạng thái xác minh.
- `identity-service`: nghiệp vụ hồ sơ đối tác, OCR CCCD, lưu CCCD private, gọi eKYC nội bộ, lưu kết quả xác minh.
- `ekyc-service`: Python/FastAPI, OpenCV YuNet + SFace, stateless đối với ảnh/video.
- `api-gateway`: chỉ CUSTOMER được tạo challenge/gửi hồ sơ; System Admin duyệt ở endpoint admin hiện có.
- PostgreSQL: lưu cờ/kết quả eKYC, không lưu embedding khuôn mặt.

`ekyc-service` không publish host port trong Docker Compose. Browser không gọi service này trực tiếp; chỉ `identity-service` gọi qua Docker network bằng internal API key.

## Dữ liệu nhạy cảm

- CCCD vẫn được lưu private trong volume của `identity-service` để System Admin kiểm duyệt.
- Video không được ghi/lưu.
- 3 frame liveness chỉ tồn tại trong request/in-memory trong lúc xử lý.
- Face embedding không được ghi xuống database hoặc filesystem.
- Endpoint xem CCCD vẫn yêu cầu đúng quyền Customer sở hữu hồ sơ hoặc System Admin.

## Chạy local

Từ root project:

```powershell
cd D:\Smart-Hotel-Booking-System
docker compose up -d --build ekyc-service identity-service api-gateway
docker compose logs -f ekyc-service identity-service api-gateway
```

Sau đó frontend:

```powershell
cd D:\Smart-Hotel-Booking-System\frontend
npm install
npm run dev
```

Đăng nhập CUSTOMER và mở:

```text
http://localhost:5300/customer/partner
```

Lần build Docker đầu cần Internet để tải dependency Python và hai model OpenCV Zoo. Dockerfile kiểm tra SHA-256 của model trước khi tạo image. Khi image đã build xong, runtime không cần gọi API eKYC bên thứ ba.

## Secret trước khi deploy Internet

Không dùng các giá trị `dev-...` mặc định của Compose trên server public. Tạo hai secret khác nhau, ví dụ PowerShell:

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Chạy lệnh hai lần và đặt vào `.env`:

```dotenv
EKYC_INTERNAL_API_KEY=<secret-1>
EKYC_TOKEN_SECRET=<secret-2>
```

Có mẫu tại `.env.ekyc.example`.

Website deploy bắt buộc nên dùng HTTPS; browser cần secure context để dùng camera (`getUserMedia`).

## Migration

`identity-service` có migration:

```text
V20260809_03__add_partner_ekyc.sql
```

Các cột thêm vào `partner_requests`:

- `liveness_verified`
- `face_verified`
- `face_similarity`
- `ekyc_verified`
- `ekyc_challenge_id`
- `ekyc_processed_at`

## Các kiểm tra eKYC hiện có

- Signed challenge token HMAC, gắn với user và có TTL.
- Challenge rate limit.
- Đúng một khuôn mặt trên CCCD và từng frame live.
- Kích thước/độ sáng/độ nét/diện tích khuôn mặt.
- Frame đầu phải gần tư thế nhìn thẳng.
- Hai frame sau phải thể hiện hai hướng quay đầu đối nghịch với biên độ tối thiểu.
- Các frame phải có khác biệt hình ảnh tối thiểu để chặn việc gửi lặp cùng một ảnh.
- SFace xác nhận cùng một người xuyên suốt các frame live.
- SFace face match CCCD <-> live center frame.
- Backend System Admin kiểm tra lại `ekyc_verified` trước khi approve; không thể chỉ sửa frontend để lách.

## Threshold mặc định

```text
Face match CCCD/live:       0.42
Live-frame consistency:     0.34
Challenge TTL:              300 giây
Challenge limit:            5 / 600 giây / user / instance
```

Các ngưỡng này là cấu hình cho đồ án/demo. Khi dùng dữ liệu camera thực tế, nên test trên nhiều thiết bị/điều kiện ánh sáng rồi hiệu chỉnh để cân bằng false reject và false accept.

## Test lại thủ công

1. CCCD đúng + đúng người + đủ 3 động tác -> hồ sơ được gửi PENDING.
2. CCCD khác người -> face match phải fail, hồ sơ không được tạo.
3. Gửi cùng một ảnh cho cả 3 frame -> liveness fail.
4. Không quay đủ hai hướng -> liveness fail.
5. Ảnh quá tối/mờ/khuôn mặt quá nhỏ -> fail.
6. Dùng challenge của tài khoản A với tài khoản B -> fail.
7. Challenge hết hạn -> fail.
8. Xin challenge quá số lần cho phép -> bị rate limit.
9. Gọi submit thiếu frame -> backend reject.
10. Hồ sơ OCR-only cũ -> System Admin không được approve cho tới khi Customer gửi lại và eKYC đạt.
11. Sau approve -> refresh token bị revoke và người dùng phải đăng nhập lại để lấy role HOTEL_ADMIN.
12. Deploy HTTPS -> browser vẫn mở camera bình thường.

## Giới hạn cần trình bày đúng

Đây là **project-grade self-hosted eKYC**, không phải giải pháp PAD/eKYC được chứng nhận cấp ngân hàng. Challenge head-turn + frame consistency giúp chống ảnh tĩnh và một số replay đơn giản, nhưng không đảm bảo chặn mọi video replay, màn hình phát lại hoặc deepfake tinh vi. Với môi trường tài chính/rủi ro pháp lý cao, cần thêm anti-spoof/PAD chuyên dụng, giám sát, calibration trên dữ liệu thực và/hoặc nhà cung cấp eKYC được chứng nhận.

Vì System Admin vẫn duyệt cuối cùng, EnziuRooms không tự động cấp HOTEL_ADMIN chỉ dựa vào một score AI.
