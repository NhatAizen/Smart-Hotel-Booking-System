package com.smarthotel.hotel.hotel.dto;

import com.smarthotel.hotel.hotel.entity.HotelStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateHotelRequest(

        @NotBlank(message = "Tên khách sạn không được để trống")
        @Size(max = 150, message = "Tên khách sạn tối đa 150 ký tự")
        String name,

        @Size(max = 2000, message = "Mô tả tối đa 2000 ký tự")
        String description,

        @NotBlank(message = "Địa chỉ không được để trống")
        @Size(max = 255, message = "Địa chỉ tối đa 255 ký tự")
        String address,

        @NotBlank(message = "Thành phố không được để trống")
        @Size(max = 100, message = "Thành phố tối đa 100 ký tự")
        String city,

        @Size(max = 30, message = "Số điện thoại tối đa 30 ký tự")
        String phone,

        @Email(message = "Email không đúng định dạng")
        @Size(max = 150, message = "Email tối đa 150 ký tự")
        String email,

        @NotNull(message = "Số sao không được để trống")
        @Min(value = 0, message = "Số sao tối thiểu là 0")
        @Max(value = 5, message = "Số sao tối đa là 5")
        Integer starRating,

        @NotNull(message = "Trạng thái không được để trống")
        HotelStatus status

) {
}