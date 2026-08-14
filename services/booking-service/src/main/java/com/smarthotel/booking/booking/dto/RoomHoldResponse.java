package com.smarthotel.booking.booking.dto;

import java.time.Instant;
import java.util.UUID;

public record RoomHoldResponse(
        UUID roomId,
        Instant expiresAt
) {
}
