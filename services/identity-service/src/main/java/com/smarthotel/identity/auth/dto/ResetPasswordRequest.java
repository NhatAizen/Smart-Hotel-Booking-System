package com.smarthotel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(

        @NotBlank(message = "Token không được để trống")
        String token,

        @NotBlank(message = "Mật khẩu mới không được để trống")
        @Size(
                min = 8,
                max = 72,
                message = "Mật khẩu mới phải từ 8 đến 72 ký tự"
        )
        String newPassword

) {
}