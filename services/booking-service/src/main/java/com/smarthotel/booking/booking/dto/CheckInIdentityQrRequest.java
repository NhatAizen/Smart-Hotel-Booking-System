package com.smarthotel.booking.booking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CheckInIdentityQrRequest(
        @NotBlank(message = "Mã QR check-in không được để trống")
        String code,

        @NotBlank(message = "Dữ liệu QR CCCD không được để trống")
        @Size(max = 4096, message = "Dữ liệu QR CCCD không hợp lệ")
        String identityQrData
) {
}
