package com.smarthotel.booking.booking.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record RoleChangeBookingEligibilityRequest(
        @NotNull UUID ownerId,
        @NotNull
        @Size(max = 1000, message = "Danh sach khach san toi da 1000 muc")
        List<@NotNull UUID> hotelIds
) {
}
