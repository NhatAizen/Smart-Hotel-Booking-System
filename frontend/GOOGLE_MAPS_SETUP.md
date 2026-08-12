# Google Maps cho EnziuRooms

Frontend đã có chế độ bản đồ dạng split-view tương tự Booking.com.

## Cấu hình

1. Trên Google Maps Platform, bật **Maps JavaScript API** và **Geocoding API** trong cùng một Google Cloud project.
2. Tạo API key và giới hạn key bằng **HTTP referrers** (ví dụ `http://localhost:5300/*`).
3. Điền vào `frontend/.env`:

```env
VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY
VITE_GOOGLE_MAP_ID=
```

`VITE_GOOGLE_MAP_ID` có thể để trống trong lúc phát triển. Ứng dụng dùng `DEMO_MAP_ID` để Advanced Marker hoạt động. Khi deploy production nên tạo Map ID riêng.

## Cách hoạt động

- Customer bấm **Xem bản đồ** ở trang `/hotels` -> mở giao diện 3 cột: bộ lọc, danh sách khách sạn, Google Map.
- Click khách sạn ở danh sách -> map pan/zoom tới marker và mở popup.
- Click marker -> popup có ảnh, tên, sao, đánh giá và nút **Xem phòng**.
- Khi Hotel Admin tạo khách sạn mới và API key đã cấu hình, frontend geocode địa chỉ thật để kiểm tra địa chỉ và lưu `googlePlaceId` vào Hotel Service.
- Khi mở bản đồ, `googlePlaceId` được dùng để lấy vị trí hiện tại từ Google Maps. Với dữ liệu khách sạn cũ chưa có Place ID, frontend tạm geocode từ địa chỉ để vẫn hiển thị marker.

## Vì sao lưu Place ID thay vì lưu tọa độ Google lâu dài?

Google Maps cho phép lưu Place ID lâu dài, còn dữ liệu geocoding khác có các giới hạn lưu trữ/caching theo điều khoản Google Maps Platform. Vì vậy EnziuRooms chỉ lưu `googlePlaceId`; tọa độ dùng để vẽ marker được lấy khi mở bản đồ.

## Backend

Hotel Service đã thêm migration:

`V20260809.01__add_hotel_google_place_id.sql`

Migration thêm cột `google_place_id` vào bảng `hotels`.
