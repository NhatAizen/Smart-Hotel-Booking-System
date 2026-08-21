package com.smarthotel.booking.promotion.dto;

import com.smarthotel.booking.promotion.entity.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PromotionResponse(
        UUID id,
        String code,
        String name,
        String description,
        PromotionScope scope,
        UUID hotelId,
        DiscountType discountType,
        BigDecimal discountValue,
        BigDecimal maxDiscount,
        BigDecimal minBookingAmount,
        Instant startAt,
        Instant endAt,
        Integer usageLimit,
        Integer usagePerUser,
        Integer usedCount,
        boolean active,
        FundingSource fundingSource,
        String lifecycle
) {
    public static PromotionResponse from(Promotion promotion) {
        Instant now = Instant.now();
        String lifecycle;
        if (!promotion.isActive()) {
            lifecycle = "INACTIVE";
        } else if (now.isBefore(promotion.getStartAt())) {
            lifecycle = "SCHEDULED";
        } else if (!now.isBefore(promotion.getEndAt())) {
            lifecycle = "EXPIRED";
        } else if (
                promotion.getUsageLimit() != null
                        && promotion.getUsedCount() >= promotion.getUsageLimit()
        ) {
            lifecycle = "EXHAUSTED";
        } else {
            lifecycle = "ACTIVE";
        }

        return new PromotionResponse(
                promotion.getId(),
                promotion.getCode(),
                promotion.getName(),
                promotion.getDescription(),
                promotion.getScope(),
                promotion.getHotelId(),
                promotion.getDiscountType(),
                promotion.getDiscountValue(),
                promotion.getMaxDiscount(),
                promotion.getMinBookingAmount(),
                promotion.getStartAt(),
                promotion.getEndAt(),
                promotion.getUsageLimit(),
                promotion.getUsagePerUser(),
                promotion.getUsedCount(),
                promotion.isActive(),
                promotion.getFundingSource(),
                lifecycle
        );
    }
}
