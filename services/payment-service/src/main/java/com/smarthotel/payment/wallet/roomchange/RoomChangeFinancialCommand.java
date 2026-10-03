package com.smarthotel.payment.wallet.roomchange;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record RoomChangeFinancialCommand(
        UUID eventId,
        UUID roomChangeId,
        long roomChangeVersion,
        UUID bookingId,
        UUID customerId,
        BigDecimal newWholeBookingTotal,
        BigDecimal expectedNetRetainedAmount,
        Instant occurredAt,
        String correlationId
) {}
