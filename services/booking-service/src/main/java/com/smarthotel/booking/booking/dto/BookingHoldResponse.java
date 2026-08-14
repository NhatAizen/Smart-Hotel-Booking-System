package com.smarthotel.booking.booking.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record BookingHoldResponse(
        UUID holdToken,
        UUID hotelId,
        List<UUID> roomIds,
        LocalDate checkIn,
        LocalDate checkOut,
        Instant expiresAt
) {
}
