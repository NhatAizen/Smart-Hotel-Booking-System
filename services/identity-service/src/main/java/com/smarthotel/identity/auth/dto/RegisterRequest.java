package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dữ liệu frontend gửi lên khi đăng ký.
 */
public record RegisterRequest(

        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        @Size(
                max = 255,
                message = "Email không được vượt quá 255 ký tự"
        )
        String email,

        @NotBlank(message = "Mật khẩu không được để trống")
        @Size(
                min = 8,
                max = 72,
                message = "Mật khẩu phải từ 8 đến 72 ký tự"
        )
        String password,

        @NotBlank(message = "Họ tên không được để trống")
        @Size(
                min = 2,
                max = 150,
                message = "Họ tên phải từ 2 đến 150 ký tự"
        )
        String fullName

) {
}