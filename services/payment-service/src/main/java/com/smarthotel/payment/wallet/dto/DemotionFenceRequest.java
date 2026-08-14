package com.smarthotel.payment.wallet.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record DemotionFenceRequest(
        @NotNull(message = "transitionId không được để trống")
        UUID transitionId
) {
}
