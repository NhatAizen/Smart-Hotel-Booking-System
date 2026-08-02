package com.smarthotel.payment.payment.dto;

import com.smarthotel.payment.payment.entity.PaymentMethod;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public record CreatePaymentRequest(

        @NotNull(message = "Booking ID is required")
        UUID bookingId,

        @NotNull(message = "Customer ID is required")
        UUID customerId,

        @NotNull(message = "Amount is required")
        @DecimalMin(value = "0.01", message = "Amount must be greater than 0")
        BigDecimal amount,

        @NotNull(message = "Payment method is required")
        PaymentMethod method

) {
}