package com.smarthotel.payment.refund.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateRefundRequest(
        @NotNull UUID bookingId,
        @NotBlank @Size(max = 60) String reasonCode,
        @Size(max = 1000) String note,
        @Size(max = 120) String bankName,
        @Size(max = 60) String accountNumber,
        @Size(max = 180) String accountName
) {}
