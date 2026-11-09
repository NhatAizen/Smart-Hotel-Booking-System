package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record AssistantQueryContext(
        @Size(max = 80) String city,
        @DecimalMin("0") @DecimalMax("1000000000") BigDecimal maxBudgetPerNight,
        @Min(1) @Max(5) Integer starRating,
        LocalDate checkIn,
        LocalDate checkOut,
        @Min(1) @Max(20) Integer adults,
        @Min(0) @Max(20) Integer children,
        @Size(max = 16) List<@Size(max = 80) String> amenities,
        boolean availabilityChecked,
        @jakarta.validation.Valid AssistantRoomCriteria roomCriteria,
        @jakarta.validation.Valid NearbyLocation nearby
) {
    public AssistantQueryContext(String city, BigDecimal maxBudgetPerNight, Integer starRating,
            LocalDate checkIn, LocalDate checkOut, Integer adults, Integer children, List<String> amenities,
            boolean availabilityChecked, AssistantRoomCriteria roomCriteria) {
        this(city,maxBudgetPerNight,starRating,checkIn,checkOut,adults,children,amenities,availabilityChecked,roomCriteria,null);
    }
    public AssistantQueryContext(String city, BigDecimal maxBudgetPerNight, Integer starRating,
                                 LocalDate checkIn, LocalDate checkOut, Integer adults, Integer children,
                                 List<String> amenities, boolean availabilityChecked) {
        this(city, maxBudgetPerNight, starRating, checkIn, checkOut, adults, children, amenities, availabilityChecked, null);
    }
}
