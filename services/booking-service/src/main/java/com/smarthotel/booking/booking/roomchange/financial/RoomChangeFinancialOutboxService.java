package com.smarthotel.booking.booking.roomchange.financial;

import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Service
public class RoomChangeFinancialOutboxService {
    private final RoomChangeFinancialOutboxRepository repository;

    public RoomChangeFinancialOutboxService(RoomChangeFinancialOutboxRepository repository) {
        this.repository = repository;
    }

    public void enqueue(
            UUID roomChangeId,
            UUID bookingId,
            UUID customerId,
            BigDecimal newBookingTotal,
            BigDecimal expectedNetRetainedAmount,
            long roomChangeVersion
    ) {
        repository.save(new RoomChangeFinancialOutboxEvent(
                roomChangeId,
                bookingId,
                customerId,
                newBookingTotal,
                expectedNetRetainedAmount,
                roomChangeVersion,
                Instant.now(),
                MDC.get("correlationId")
        ));
    }
}
