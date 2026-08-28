ENZIUROOMS - PUBLIC HOMEPAGE FIX (2026-08-27)

Fix: Guest truy cập https://enziurooms.xyz/ không còn bị chuyển sang /login.

Nguyên nhân:
HomeFutureSections gọi GET /membership/tiers ngay cả khi chưa đăng nhập.
Endpoint này trả 401 cho Guest. apiClient có cơ chế bảo vệ phiên: khi gặp 401 ở ngoài màn hình auth sẽ chuyển sang /login.

Đã sửa:
- Chỉ gọi getMembershipLevels() khi isAuthenticated = true.
- Guest vẫn xem Home, tìm kiếm, khách sạn, điểm đến, FAQ, AI và footer bình thường.
- Phần Membership khi Guest chỉ hiển thị lời mời đăng nhập; không dùng dữ liệu giả.
- Không sửa backend, OAuth, booking, hotel API hay Navbar.
