package com.smarthotel.ai.assistant.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public record HotelCandidate(

        @NotNull(message = "Hotel ID is required")
        UUID hotelId,

        @NotBlank(message = "Hotel name is required")
        String name,

        @NotBlank(message = "City is required")
        String city,

        Integer starRating,

        @DecimalMin(value = "0.0", message = "Price must not be negative")
        BigDecimal pricePerNight,

        String description

) {
}