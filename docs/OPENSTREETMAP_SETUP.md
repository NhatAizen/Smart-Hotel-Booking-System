# OpenStreetMap + Leaflet cho EnziuRooms

EnziuRooms dùng OpenStreetMap để hiển thị bản đồ khách sạn và Leaflet để xử lý marker/popup.

## Không cần API key

Không cần tạo Google Maps API key và không cần thêm biến môi trường cho bản đồ.
Frontend tải Leaflet từ jsDelivr khi người dùng mở chế độ **Xem bản đồ** và tải tile từ OpenStreetMap.

## Cách hoạt động

- Hotel Admin nhập địa chỉ thật khi tạo khách sạn.
- Frontend gọi dịch vụ tìm kiếm địa chỉ Nominatim của OpenStreetMap để lấy `latitude` và `longitude`.
- Hotel Service lưu hai tọa độ này vào bảng `hotels`.
- Trang danh sách khách sạn dùng tọa độ đã lưu để đặt marker ngay lập tức.
- Khách sạn cũ chưa có tọa độ vẫn được geocode tạm thời từ địa chỉ khi mở bản đồ.
- Các yêu cầu geocode fallback được chạy tuần tự để tránh gửi dồn nhiều request.

## Database

Migration mới:

`V20260810.01__add_hotel_coordinates.sql`

thêm hai cột:

- `latitude DOUBLE PRECISION`
- `longitude DOUBLE PRECISION`

## Lưu ý khi triển khai thật

OpenStreetMap tile và Nominatim public phù hợp cho đồ án/demo và mức sử dụng nhẹ. Nếu EnziuRooms có lượng truy cập lớn, nên chuyển tile/geocoding sang nhà cung cấp chuyên dụng hoặc tự host theo chính sách sử dụng của OpenStreetMap/Nominatim.
