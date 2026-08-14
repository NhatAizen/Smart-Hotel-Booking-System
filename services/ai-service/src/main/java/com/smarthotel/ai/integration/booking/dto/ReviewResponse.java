package com.smarthotel.ai.integration.booking.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ReviewResponse(
        UUID id,
        UUID bookingId,
        UUID customerId,
        String customerName,
        UUID hotelId,
        Integer rating,
        Integer staffRating,
        Integer facilitiesRating,
        Integer cleanlinessRating,
        Integer comfortRating,
        Integer valueRating,
        Integer locationRating,
        Integer wifiRating,
        String title,
        String positiveComment,
        String negativeComment,
        List<String> images,
        Instant createdAt
) {
}
