package com.smarthotel.hotel.rolechange.fence;

import java.util.UUID;

public record OwnerDemotionFenceResponse(
        UUID ownerId,
        UUID transitionId,
        boolean frozen
) {
}

