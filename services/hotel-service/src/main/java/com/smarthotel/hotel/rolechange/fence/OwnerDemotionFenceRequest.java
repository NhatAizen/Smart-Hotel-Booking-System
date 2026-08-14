package com.smarthotel.hotel.rolechange.fence;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record OwnerDemotionFenceRequest(
        @NotNull UUID transitionId
) {
}

