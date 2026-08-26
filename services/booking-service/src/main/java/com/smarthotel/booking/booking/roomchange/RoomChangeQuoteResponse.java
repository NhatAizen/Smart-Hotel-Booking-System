package com.smarthotel.booking.booking.roomchange;

import java.math.BigDecimal;
import java.util.UUID;

public record RoomChangeQuoteResponse(
        UUID requestId,
        UUID bookingId,
        UUID targetRoomId,
        UUID targetRoomTypeId,
        String targetRoomNumber,
        String targetRoomTypeName,
        BigDecimal oldTotalPrice,
        BigDecimal newTotalPrice,
        BigDecimal priceDifference,
        BigDecimal additionalPaymentDue,
        String paymentOption,
        Integer depositPercent
) {
}
