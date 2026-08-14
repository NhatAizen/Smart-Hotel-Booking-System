package com.smarthotel.booking.pricing.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record NightlyPriceResponse(
        LocalDate stayDate,
        BigDecimal basePrice,
        String pricingType,
        String pricingLabel,
        BigDecimal surchargePercent,
        BigDecimal surchargeAmount,
        BigDecimal finalPrice
) {}
