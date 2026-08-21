package com.smarthotel.identity.auth.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(

        @JsonAlias("email")
        @NotBlank(message = "Tên đăng nhập hoặc email không được để trống")
        String identifier,

        @NotBlank(message = "Mật khẩu không được để trống")
        String password

) {
}
