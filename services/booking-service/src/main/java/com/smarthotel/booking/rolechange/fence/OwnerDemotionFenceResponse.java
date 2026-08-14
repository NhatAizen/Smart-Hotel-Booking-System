package com.smarthotel.booking.rolechange.fence;

import java.util.List;
import java.util.UUID;

public record OwnerDemotionFenceResponse(
        UUID ownerId,
        UUID transitionId,
        boolean frozen,
        List<UUID> hotelIds
) {
}

