package com.smarthotel.booking.booking.dto;

import jakarta.validation.constraints.NotBlank;

public record CheckInVerifyRequest(
        @NotBlank(message = "Mã QR check-in không được để trống")
        String code
) {
}
