package com.smarthotel.hotel.pricing.dto;

import com.smarthotel.hotel.pricing.entity.ManualDailyPriceRule;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ManualDailyPriceRuleResponse(
        UUID id,
        UUID hotelId,
        UUID roomTypeId,
        LocalDate startDate,
        LocalDate endDate,
        BigDecimal nightlyPrice,
        BigDecimal approvedBasePriceAtSave,
        boolean withinCurrentApprovedBounds,
        boolean activeForCustomer,
        Instant createdAt,
        Instant updatedAt
) {
    public static ManualDailyPriceRuleResponse from(ManualDailyPriceRule rule,
                                                     boolean withinCurrentApprovedBounds) {
        return new ManualDailyPriceRuleResponse(rule.getId(), rule.getHotelId(), rule.getRoomTypeId(),
                rule.getStartDate(), rule.getEndDate(), rule.getNightlyPrice(),
                rule.getApprovedBasePriceAtSave(), withinCurrentApprovedBounds, false,
                rule.getCreatedAt(), rule.getUpdatedAt());
    }
}
