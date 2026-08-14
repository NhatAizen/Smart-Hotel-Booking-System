package com.smarthotel.booking.pricing.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record LateCheckoutDetailsResponse(
        boolean overdue,
        long overdueMinutes,
        int graceMinutes,
        boolean feeAssessed,
        Instant feeAssessedAt,
        BigDecimal assessedFee,
        BigDecimal estimatedFee,
        BigDecimal feePercent,
        int chargedNights,
        String policyLabel,
        boolean paymentRequired,
        boolean canCheckOut
) {}
