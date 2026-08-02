package com.smarthotel.payment.payment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FailPaymentRequest(

        @NotBlank(message = "Failure reason is required")
        @Size(max = 500, message = "Failure reason must not exceed 500 characters")
        String failureReason

) {
}