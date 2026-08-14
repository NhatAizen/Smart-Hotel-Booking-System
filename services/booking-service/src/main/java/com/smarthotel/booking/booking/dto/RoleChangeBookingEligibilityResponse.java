package com.smarthotel.booking.booking.dto;

import java.util.List;

public record RoleChangeBookingEligibilityResponse(
        boolean eligible,
        long currentStayCount,
        long actionableBookingCount,
        List<String> blockers
) {
}
