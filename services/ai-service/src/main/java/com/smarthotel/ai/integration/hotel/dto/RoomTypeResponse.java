package com.smarthotel.ai.integration.hotel.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RoomTypeResponse(

        UUID id,
        UUID hotelId,
        String name,
        String description,
        BigDecimal basePrice,
        Integer maxAdults,
        Integer maxChildren,
        String bedType,
        Integer areaSqm

) {
}