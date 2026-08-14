package com.smarthotel.booking.booking.realtime;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AvailabilityEvent(
        String type,
        UUID hotelId,
        List<UUID> roomIds,
        LocalDate checkIn,
        LocalDate checkOut,
        Instant expiresAt,
        Instant occurredAt
) {
    public static AvailabilityEvent of(
            String type,
            UUID hotelId,
            List<UUID> roomIds,
            LocalDate checkIn,
            LocalDate checkOut,
            Instant expiresAt
    ) {
        return new AvailabilityEvent(
                type,
                hotelId,
                List.copyOf(roomIds),
                checkIn,
                checkOut,
                expiresAt,
                Instant.now()
        );
    }
}
