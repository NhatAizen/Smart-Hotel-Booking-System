package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.BookingPaymentType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ApplyPaymentRequest(
        @NotNull
        @DecimalMin(value = "0.01", message = "Số tiền phải lớn hơn 0")
        BigDecimal amount,

        @NotNull
        BookingPaymentType paymentType
) {
}
