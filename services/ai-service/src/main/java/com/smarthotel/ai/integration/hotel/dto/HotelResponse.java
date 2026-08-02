package com.smarthotel.ai.integration.hotel.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record HotelResponse(

        UUID id,
        UUID ownerId,
        String name,
        String description,
        String address,
        String city,
        String phone,
        String email,
        Integer starRating,
        String status

) {
}