package com.smarthotel.identity.rolechange.dto;

import java.util.List;
import java.util.UUID;

public record RoleChangeBookingEligibilityRequest(
        UUID ownerId,
        List<UUID> hotelIds
) {
}
