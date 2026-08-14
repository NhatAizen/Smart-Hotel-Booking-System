package com.smarthotel.booking.review.dto;

import java.util.Map;
import java.util.UUID;

public record ReviewSummaryResponse(
        UUID hotelId,
        long reviewCount,
        Double averageRating,
        Map<Integer, Long> ratingDistribution,
        Map<String, Double> categoryAverages
) {
}
