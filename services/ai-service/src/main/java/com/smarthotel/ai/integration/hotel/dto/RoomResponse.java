package com.smarthotel.ai.integration.hotel.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RoomResponse(
        UUID id,
        UUID hotelId,
        UUID roomTypeId,
        String roomNumber,
        Integer floor,
        String status,
        BigDecimal customPrice,
        String note
) {
}
