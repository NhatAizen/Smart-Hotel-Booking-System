ENZIUROOMS FRONTEND - FULL LATEST
================================

Bản source frontend đầy đủ đã gộp các thay đổi mới nhất trong cuộc trò chuyện:

- Customer / public frontend hiện tại.
- Enziu AI Copilot / Booking Agent hiện có trong bản nền.
- Customer <-> Hotel chat và các màn liên quan.
- NO_SHOW / refund UI hiện có trong bản nền.
- Hotel Admin Dashboard bản đã chốt.
- Quản lý phòng UI mới.
- Khách đang lưu trú UI mới.
- Ví / hoàn tiền Hotel Admin UI mới.
- System Admin Dashboard + navbar gom nhóm.
- Hotel Admin navbar dùng ảnh khách sạn thật từ dữ liệu hotel khi có.
- CSS legacy đã tách thành các module chuyên trách trong src/styles/.
- Home hero có Ken Burns + parallax nhẹ + light motion.
- Customer Navbar hỗ trợ logo ảnh JPG tại src/assets/enziu-logo.jpg.

LOGO JPG
--------
Trong gói có một ảnh placeholder để source chạy độc lập.
Hãy chép đè file logo JPG thật của bạn vào đúng đường dẫn:

  frontend/src/assets/enziu-logo.jpg

Không cần sửa Navbar.jsx sau khi thay ảnh.

CSS
---
Entry point CSS mới:
  frontend/src/styles/index.css

main.jsx import:
  ./index.css
  ./styles/index.css

Không tiếp tục nhồi CSS mới vào global.css. Hãy thêm vào module tương ứng.

CHẠY
----
cd frontend
npm install
npm run build
npm run dev

Nếu CSS cũ còn cache trong Chrome: Ctrl + Shift + R.
