package com.smarthotel.identity.oauth.dto;

import jakarta.validation.constraints.NotBlank;

public record OAuth2CodeExchangeRequest(
        @NotBlank(message = "Mã đăng nhập không được để trống")
        String code
) {
}
