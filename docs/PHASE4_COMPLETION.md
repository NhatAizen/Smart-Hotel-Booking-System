# EnziuRooms — PHASE 4 System Admin hoàn tất

Bản này tiếp tục trực tiếp từ `frontend(10).7z` tại thời điểm Codex hết quota trong PHASE 4.

## Phạm vi đã khóa

- Tổng quan System Admin tiếp tục dùng dữ liệu API thật và có chống race giữa refresh thủ công/realtime.
- Navbar System Admin giữ cấu trúc nhóm: Tổng quan / Tài khoản / Kiểm duyệt / Kinh doanh / Thông báo.
- Quản lý tài khoản, yêu cầu đối tác, duyệt khách sạn, duyệt loại phòng, marketing và notification giữ nguyên API/business logic hiện tại.
- Ví & đối soát không biến lỗi API thành số `0` hoặc danh sách rỗng giả:
  - ví nền tảng;
  - lịch sử hoa hồng;
  - yêu cầu rút tiền;
  - doanh thu đang giữ;
  - yêu cầu hoàn tiền;
  mỗi nguồn có trạng thái lỗi riêng.
- Lookup tên Customer/Partner vẫn lấy từ API quản trị tài khoản; khi không tải được tên, UI hiển thị trạng thái trung tính và mã tham chiếu thay vì bịa dữ liệu.
- Luồng rút tiền, chuyển khoản thật, upload chứng từ, refund phần EnziuRooms, chứng từ khách sạn, đối soát thủ công và giải ngân không đổi endpoint/payload.
- Browser `window.confirm()` đã được loại khỏi toàn bộ các route System Admin đang sử dụng. Các thao tác phê duyệt đối tác/khách sạn/loại phòng dùng dialog của design system để tránh click nhầm và đồng bộ UX.
- Enum backend vẫn giữ nguyên ở data layer; UI hiển thị nhãn tiếng Việt ở presentation layer.

## Các file được hoàn thiện thêm ở lượt này

- `src/pages/admin/AdminDashboard.jsx`
- `src/pages/admin/PlatformWalletPage.jsx`
- `src/pages/admin/PlatformWalletPage.css`
- `src/pages/admin/ManageHotelsPage.jsx`
- `src/pages/admin/ManageRoomTypesPage.jsx`
- `src/pages/admin/ManageRoomTypesPage.css`
- `src/pages/admin/PartnerRequestsPage.jsx`
- `src/pages/admin/PartnerRequestsExperience.css`

Toàn bộ các thay đổi PHASE 4 mà Codex đã làm trước khi hết quota cũng được giữ nguyên trong full frontend này.

## Kiểm tra đã chạy

```text
npm run lint  -> PASS
npm run build -> PASS
```

Vite build thành công với 1992 modules. Chỉ còn cảnh báo bundle lớn hơn 500 kB; đây là cảnh báo tối ưu code-splitting, không phải lỗi build và không thay đổi nghiệp vụ trong PHASE 4.

## Checkpoint Git khuyên dùng trên máy

Sau khi copy patch/full frontend và kiểm tra giao diện:

```powershell
cd D:\Smart-Hotel-Booking-System

git add frontend
git commit -m "UI checkpoint: phase 4 - system admin"
```

Nếu project đang có `.env` riêng, giữ nguyên `.env` hiện tại. Gói trả về không chép đè `.env`, `node_modules` hoặc `dist`.

## Chạy

```powershell
cd D:\Smart-Hotel-Booking-System\frontend
npm install
npm run lint
npm run build
npm run dev
```

Nếu port `5300` đang bị tiến trình cũ chiếm, tắt tiến trình cũ trước khi chạy dev server thay vì đổi port của project.
