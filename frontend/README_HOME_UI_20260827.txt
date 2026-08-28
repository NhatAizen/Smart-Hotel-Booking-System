ENZIUROOMS - FULL FRONTEND HOMEPAGE UI 2026-08-27
==================================================

Bản này được chỉnh trực tiếp trên frontend người dùng đã gửi trong cuộc trò chuyện,
bao gồm cấu hình OAuth production hiện có. Không thay backend/database/API.

NÂNG CẤP TRANG CHỦ
------------------
- Giữ Navbar, Hero, HotelSearchBar, campaign, khách sạn nổi bật, điểm đến và review thật.
- Hiển thị tối đa 6 điểm đến lấy từ dữ liệu khách sạn thật.
- Thêm hành trình đặt phòng -> thanh toán -> QR check-in -> hoàn tiền.
- Thêm khu vực cấp thành viên lấy từ API /membership/tiers, không hard-code mức giảm giả.
- Thêm Enziu AI showcase và mở chatbot hiện tại.
- Thêm khu vực đăng ký/điều hướng đối tác theo role thật.
- Thêm FAQ.
- Nâng cấp footer với Hỗ trợ / Chính sách / Đối tác / Tài khoản.
- Thêm các trang công khai:
  /about
  /help
  /terms
  /privacy
  /cancellation-policy
  /refund-policy
  /payment-policy

FILE CHÍNH ĐƯỢC THAY ĐỔI/THÊM
-----------------------------
src/pages/shared/HomePage.jsx
src/routes/AppRoutes.jsx
src/components/home/HomeFutureSections.jsx
src/components/home/HomeFutureSections.css
src/components/home/EnziuHomeFooter.jsx
src/components/home/EnziuHomeFooter.css
src/pages/shared/LegalInfoPage.jsx
src/pages/shared/LegalInfoPage.css

KIỂM TRA
--------
npm run build: PASS (Vite 8.2.0, 2012 modules transformed)
ESLint các file mới/sửa của homepage: PASS
Full lint còn 4 lỗi có sẵn ngoài phạm vi thay đổi homepage:
- src/pages/auth/EnziuLoginPage.jsx: Date.now purity
- src/pages/hotel-admin/HotelBookingsPage.jsx: 2 unused functions
- src/pages/shared/HotelDetailPage.jsx: 1 unused function

CHẠY
----
cd D:\Smart-Hotel-Booking-System\frontend
npm install
npm run dev

Production:
cd D:\Smart-Hotel-Booking-System
powershell -ExecutionPolicy Bypass -File .\infrastructure\deploy\deploy.ps1
