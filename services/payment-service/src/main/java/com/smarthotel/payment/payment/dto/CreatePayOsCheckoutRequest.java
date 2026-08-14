package com.smarthotel.payment.payment.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.UUID;

public record CreatePayOsCheckoutRequest(
        @NotEmpty(message = "Danh sách booking không được để trống")
        List<UUID> bookingIds
) {
}
