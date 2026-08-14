package com.smarthotel.booking.pricing.dto;

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
        List<RoomPricingQuoteResponse> rooms
) {}
