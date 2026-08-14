package com.smarthotel.booking.booking.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AvailabilityResponse(
        UUID hotelId,
        LocalDate checkIn,
        LocalDate checkOut,
        List<UUID> unavailableRoomIds,
        List<RoomHoldResponse> heldRooms
) {
}
