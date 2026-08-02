package com.smarthotel.payment.payment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CompletePaymentRequest(

        @NotBlank(message = "Transaction code is required")
        @Size(max = 120, message = "Transaction code must not exceed 120 characters")
        String transactionCode

) {
}