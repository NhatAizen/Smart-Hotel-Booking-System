package com.smarthotel.booking.booking.roomchange.financial;

import java.math.BigDecimal;
import java.util.UUID;

public record RoomChangeFinancialResult(UUID eventId, UUID bookingId, UUID customerId,
        long roomChangeVersion, BigDecimal newWholeBookingTotal,
        BigDecimal expectedNetRetainedAmount, String outcome, BigDecimal creditedAmount,
        BigDecimal netRetainedAmount, String reason) {}
