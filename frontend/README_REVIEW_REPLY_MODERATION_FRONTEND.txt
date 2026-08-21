ENZIUROOMS - REVIEW REPLY & MODERATION - FRONTEND
=================================================

ĐÃ TRIỂN KHAI FRONTEND
----------------------
1. HOTEL ADMIN
   URL: /hotel-admin/reviews
   - Navbar có mục "Đánh giá".
   - Xem review của khách sạn mình.
   - Lọc theo khách sạn / trạng thái phản hồi / điểm / từ khóa.
   - Thống kê tổng review, chờ phản hồi, đã phản hồi, điểm trung bình.
   - Phản hồi review.
   - Sửa phản hồi.
   - Xóa phản hồi.
   - Hiển thị trạng thái review bị System Admin ẩn.

2. SYSTEM ADMIN
   URL: /admin/reviews
   - Navbar nhóm "Kiểm duyệt" có mục "Đánh giá".
   - Xem toàn bộ review.
   - Lọc theo trạng thái VISIBLE/HIDDEN, phản hồi, điểm, từ khóa.
   - Ẩn review và bắt buộc nhập lý do.
   - Khôi phục review.
   - Không có chức năng sửa review hoặc phản hồi thay khách sạn.

3. CUSTOMER / PUBLIC
   - ReviewExplorerModal hiển thị phản hồi chính thức của khách sạn.
   - /customer/reviews cũng hiển thị phản hồi dưới review của Customer.

API FRONTEND ĐÃ NỐI
-------------------
GET    /api/hotel-admin/reviews
POST   /api/hotel-admin/reviews/{reviewId}/reply
PUT    /api/hotel-admin/reviews/{reviewId}/reply
DELETE /api/hotel-admin/reviews/{reviewId}/reply

GET    /api/admin/reviews
PATCH  /api/admin/reviews/{reviewId}/hide
PATCH  /api/admin/reviews/{reviewId}/restore

Payload reply:
{
  "content": "Cảm ơn bạn đã lựa chọn khách sạn..."
}

Payload hide:
{
  "reason": "Spam / nội dung vi phạm..."
}

Review response frontend hỗ trợ các field mới:
- hotelReply
- hotelReplyAt
- hotelReplyBy
- moderationStatus: VISIBLE | HIDDEN
- hiddenReason
- hiddenAt
- hiddenBy

BACKEND CÒN THIẾU
-----------------
File người dùng upload lần này chỉ có frontend. Để các nút reply/hide/restore chạy thật,
cần cập nhật booking-service và migration PostgreSQL tương ứng.

Hãy gửi nguyên thư mục:
D:\Smart-Hotel-Booking-System\services\booking-service

hoặc tối thiểu thư mục Java chứa HotelReview + db/migration hiện tại.

KIỂM TRA
--------
- npm run build: PASS
- ESLint riêng toàn bộ file đã sửa/thêm: PASS
- npm run lint toàn project còn 1 lỗi CŨ, không liên quan patch:
  src/pages/shared/HotelDetailPage.jsx: dedupeImages is defined but never used

CÀI PATCH
---------
Giải nén patch vào:
D:\Smart-Hotel-Booking-System\frontend

sau đó:
cd D:\Smart-Hotel-Booking-System\frontend
npm run dev

Nếu Vite cache giao diện cũ:
Remove-Item -Recurse -Force .\node_modules\.vite -ErrorAction SilentlyContinue
npm run dev

