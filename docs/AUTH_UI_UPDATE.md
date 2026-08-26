# Cập nhật giao diện Authentication - EnziuRooms

Các phần đã hoàn thiện:

- Giao diện đăng nhập hai cột, responsive.
- Giao diện đăng ký mới, kiểm tra xác nhận mật khẩu và độ mạnh mật khẩu.
- Nút hiện/ẩn mật khẩu.
- Ghi nhớ đăng nhập ở giao diện.
- Trang quên mật khẩu.
- Trang xác thực email, chống gọi token hai lần trong React StrictMode.
- Nút Google/Facebook đã sẵn giao diện và đọc URL từ `.env`.

## Chạy dự án

```powershell
cd D:\Smart-Hotel-Booking-System\frontend
npm install
npm run dev
```

## Google/Facebook OAuth

Hai nút chỉ chuyển hướng khi cấu hình:

```env
VITE_GOOGLE_OAUTH_URL=http://localhost:8080/oauth2/authorization/google
VITE_FACEBOOK_OAUTH_URL=http://localhost:8080/oauth2/authorization/facebook
```

Backend OAuth chưa có thì giao diện sẽ hiện thông báo thay vì giả lập đăng nhập thành công.
