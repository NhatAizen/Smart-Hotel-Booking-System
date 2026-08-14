package com.smarthotel.hotel.hotel.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;
import java.util.Set;

public record CreateHotelRequest(
        @NotBlank(message = "Tên khách sạn không được để trống")
        @Size(max = 150, message = "Tên khách sạn tối đa 150 ký tự")
        String name,

        @Size(max = 5000, message = "Mô tả tối đa 5000 ký tự")
        String description,

        @NotBlank(message = "Địa chỉ không được để trống")
        @Size(max = 255, message = "Địa chỉ tối đa 255 ký tự")
        String address,

        @Size(max = 100, message = "Phường/xã tối đa 100 ký tự")
        String ward,

        @Size(max = 100, message = "Quận/huyện tối đa 100 ký tự")
        String district,

        @NotBlank(message = "Thành phố không được để trống")
        @Size(max = 100, message = "Thành phố tối đa 100 ký tự")
        String city,

        @DecimalMin(value = "-90.0", message = "Vĩ độ tối thiểu là -90")
        @DecimalMax(value = "90.0", message = "Vĩ độ tối đa là 90")
        Double latitude,

        @DecimalMin(value = "-180.0", message = "Kinh độ tối thiểu là -180")
        @DecimalMax(value = "180.0", message = "Kinh độ tối đa là 180")
        Double longitude,

        @NotBlank(message = "Số điện thoại không được để trống")
        @Size(max = 30, message = "Số điện thoại tối đa 30 ký tự")
        String phone,

        @NotBlank(message = "Email liên hệ không được để trống")
        @Email(message = "Email không đúng định dạng")
        @Size(max = 150, message = "Email tối đa 150 ký tự")
        String email,

        @Min(value = 0, message = "Số sao tối thiểu là 0")
        @Max(value = 5, message = "Số sao tối đa là 5")
        Integer starRating,

        LocalTime checkInTime,
        LocalTime checkOutTime,

        @Size(max = 50, message = "Tối đa 50 tiện nghi")
        Set<@Size(max = 100, message = "Tên tiện nghi tối đa 100 ký tự") String> amenities
) {
}
