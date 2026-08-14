package com.smarthotel.identity.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record UpdateProfileRequest(
        @NotBlank(message = "Họ và tên không được để trống")
        @Size(max = 150, message = "Họ và tên tối đa 150 ký tự")
        String fullName,

        @Size(max = 30, message = "Số điện thoại tối đa 30 ký tự")
        String phone,

        LocalDate dateOfBirth,

        @Size(max = 20, message = "Giới tính tối đa 20 ký tự")
        String gender,

        @Size(max = 80, message = "Quốc tịch tối đa 80 ký tự")
        String nationality,

        @Size(max = 100, message = "Tỉnh/Thành phố tối đa 100 ký tự")
        String city,

        @Size(max = 255, message = "Địa chỉ tối đa 255 ký tự")
        String address,

        @Size(max = 500, message = "Giới thiệu tối đa 500 ký tự")
        String bio
) {
}
