package com.smarthotel.booking.pricing.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record RoomPricingQuoteResponse(
        UUID roomId,
        UUID roomTypeId,
        String roomNumber,
        String roomTypeName,
        BigDecimal baseAmount,
        BigDecimal weekendSurchargeAmount,
        BigDecimal specialDateSurchargeAmount,
        BigDecimal totalAmount,
        List<NightlyPriceResponse> nights
) {}
