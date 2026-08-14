package com.smarthotel.booking.rolechange.fence;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record OwnerDemotionFenceRequest(
        @NotNull UUID transitionId,
        @NotNull @Size(max = 1000) List<@NotNull UUID> hotelIds
) {
}

