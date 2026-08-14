package com.smarthotel.ai.integration.booking.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AvailabilityResponse(
        UUID hotelId,
        LocalDate checkIn,
        LocalDate checkOut,
        List<UUID> unavailableRoomIds
) {
}
