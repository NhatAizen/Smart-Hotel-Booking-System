package com.smarthotel.hotel.pricing.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ManualDailyPricePreviewResponse(
        UUID roomTypeId,
        String roomTypeName,
        BigDecimal approvedBasePrice,
        BigDecimal minimumNightlyPrice,
        BigDecimal maximumNightlyPrice,
        BigDecimal proposedNightlyPrice,
        long totalNights,
        List<Night> nights,
        LocalDate nextPageStart,
        List<CustomPriceRoom> roomsWithCustomPrice,
        List<UUID> conflictingRuleIds,
        boolean canSave,
        boolean replacesCustomPriceAndSurcharges,
        boolean activeForCustomer
) {
    public record Night(LocalDate stayDate, BigDecimal proposedNightlyPrice,
                        UUID conflictingRuleId) {}
    public record CustomPriceRoom(UUID roomId, String roomNumber, BigDecimal customPrice) {}
}
