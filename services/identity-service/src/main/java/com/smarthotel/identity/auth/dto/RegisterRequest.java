package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(

        @NotBlank(message = "Tên đăng nhập không được để trống")
        @Size(min = 4, max = 30, message = "Tên đăng nhập phải từ 4 đến 30 ký tự")
        @Pattern(
                regexp = "^[A-Za-z0-9][A-Za-z0-9._-]{3,29}$",
                message = "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang"
        )
        String username,

        @Email(message = "Email không đúng định dạng")
        @Size(max = 255, message = "Email không được vượt quá 255 ký tự")
        String email,

        @NotBlank(message = "Mật khẩu không được để trống")
        @Size(min = 8, max = 72, message = "Mật khẩu phải từ 8 đến 72 ký tự")
        @Pattern(
                regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s])\\S{8,72}$",
                message = "Mật khẩu phải có chữ hoa, chữ thường, số, ký tự đặc biệt và không chứa khoảng trắng"
        )
        String password,

        @NotBlank(message = "Họ tên không được để trống")
        @Size(min = 2, max = 150, message = "Họ tên phải từ 2 đến 150 ký tự")
        String fullName

) {
}
