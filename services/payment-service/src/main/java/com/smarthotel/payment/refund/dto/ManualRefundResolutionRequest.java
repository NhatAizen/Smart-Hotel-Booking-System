package com.smarthotel.payment.refund.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ManualRefundResolutionRequest(
        @NotBlank @Size(max = 1000) String note
) {}
