package com.smarthotel.booking.pricing.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PricingQuoteResponse(
        UUID hotelId,
        LocalDate checkIn,
        LocalDate checkOut,
        long nightCount,
        BigDecimal baseAmount,
        BigDecimal weekendSurchargeAmount,
        BigDecimal specialDateSurchargeAmount,
        BigDecimal totalAmount,
        List<RoomPricingQuoteResponse> rooms,
        @JsonInclude(JsonInclude.Include.NON_NULL) String pricingFingerprint
) {}
