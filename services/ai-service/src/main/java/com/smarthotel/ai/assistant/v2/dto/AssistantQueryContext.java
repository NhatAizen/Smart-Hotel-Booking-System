package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record AssistantQueryContext(
        String city,
        BigDecimal maxBudgetPerNight,
        Integer starRating,
        LocalDate checkIn,
        LocalDate checkOut,
        Integer adults,
        Integer children,
        List<String> amenities,
        boolean availabilityChecked
) {
}
