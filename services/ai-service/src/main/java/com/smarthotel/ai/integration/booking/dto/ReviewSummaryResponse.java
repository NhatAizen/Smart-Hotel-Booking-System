package com.smarthotel.ai.integration.booking.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.Map;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ReviewSummaryResponse(
        UUID hotelId,
        long reviewCount,
        Double averageRating,
        Map<Integer, Long> ratingDistribution,
        Map<String, Double> categoryAverages
) {
}
