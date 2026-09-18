# Backup và restore EnziuRooms

## Phạm vi dữ liệu

EnziuRooms hiện dùng sáu PostgreSQL database độc lập: `identity_db`, `hotel_db`, `booking_db`, `payment_db`, `notification_db` và `chat_db`. Script backup dùng `pg_dump` bên trong container nên không cần ghi mật khẩu database ra lệnh hoặc log.

Các file ảnh/tài liệu được lưu trên volume hoặc filesystem không nằm trong PostgreSQL phải được backup riêng. Cần giữ backup database và media cùng mốc thời gian để tránh bản ghi trỏ đến file không còn tồn tại.

## Tạo backup

Từ thư mục gốc dự án:

```powershell
.\scripts\backup-postgres.ps1 -RetentionDays 14
```

Mỗi database tạo một file custom-format có UTC timestamp dưới `backups/postgres/<database>/`. Thư mục này đã được git ignore. Script chỉ xóa file `.dump` hết hạn nằm bên trong backup root đã chọn.

Đối với production, chạy bằng scheduler của máy chủ sau khi Docker Compose đang hoạt động, sau đó sao chép file sang kho lưu trữ khác máy chủ và mã hóa tại nơi lưu. Không nên coi volume Docker trên cùng máy là một bản backup độc lập.

## Restore an toàn

Script restore chỉ cho phép tên database kết thúc bằng `_restore_test`, từ chối nếu database đích đã tồn tại và không thực hiện `drop`, `truncate` hoặc ghi đè database đang chạy.

```powershell
.\scripts\restore-postgres-test.ps1 `
  -Service booking `
  -BackupFile .\backups\postgres\booking_db\booking_db-20260918-020000Z.dump `
  -TargetDatabase booking_restore_test
```

Sau khi restore:

1. Kiểm tra `pg_restore` kết thúc với exit code 0.
2. So sánh các bảng chính và row count với báo cáo tại thời điểm backup.
3. Khởi động một instance ứng dụng tách biệt trỏ vào database restore và xác nhận Flyway không báo lỗi.
4. Xác nhận các quan hệ quan trọng: booking–payment, user–role, hotel–room, notification recipient và conversation message.
5. Chỉ xóa database test bằng thao tác thủ công sau khi đã xác nhận đúng target.

## Lịch và retention đề xuất

- Backup hằng ngày, giữ bản local ngắn hạn 14 ngày.
- Giữ thêm bản tuần/tháng ở kho khác máy chủ tùy yêu cầu doanh nghiệp.
- Thử restore định kỳ; một file backup chưa từng restore thử chưa thể được coi là phương án khôi phục đã xác minh.
- Theo dõi dung lượng, thời gian backup, exit code và tuổi của bản backup gần nhất.
