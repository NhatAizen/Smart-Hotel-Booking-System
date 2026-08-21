package com.smarthotel.booking.promotion.dto;

import java.math.BigDecimal;

public record PromotionSuggestionResponse(
        PromotionResponse promotion,
        boolean saved,
        BigDecimal estimatedDiscount
) {}
