package com.smarthotel.payment.payment.dto;

import com.smarthotel.payment.payment.entity.PaymentMethod;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record CreatePaymentRequest(
        @NotNull(message = "Booking ID không được để trống")
        UUID bookingId,

        @NotNull(message = "Customer ID không được để trống")
        UUID customerId,

        @NotNull(message = "Phương thức thanh toán không được để trống")
        PaymentMethod method
) {
}
