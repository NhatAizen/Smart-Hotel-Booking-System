package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record IntentAnalysis(
        String intent,
        String city,
        BigDecimal maxBudgetPerNight,
        Integer starRating,
        Integer adults,
        Integer children,
        LocalDate checkIn,
        LocalDate checkOut,
        List<String> amenities,
        List<String> hotelNames,
        String bookingCode
) {
}
