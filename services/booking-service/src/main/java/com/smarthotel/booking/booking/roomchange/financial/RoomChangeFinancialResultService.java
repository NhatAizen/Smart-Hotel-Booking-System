package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.booking.repository.BookingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;

@Service
public class RoomChangeFinancialResultService {
    private final BookingRepository bookings;
    private final RoomChangeFinancialOutboxRepository outbox;
    private final ObjectMapper mapper;
    public RoomChangeFinancialResultService(BookingRepository bookings,
            RoomChangeFinancialOutboxRepository outbox, ObjectMapper mapper) {
        this.bookings = bookings; this.outbox = outbox; this.mapper = mapper;
    }
    @Transactional
    public void apply(RoomChangeFinancialResult result) throws Exception {
        if (result == null || result.eventId() == null || result.bookingId() == null) {
            throw new IllegalArgumentException("Missing financial result identity");
        }
        var booking = bookings.findForRoomChangeUpdate(result.bookingId()).orElseThrow();
        var command = outbox.findForResultUpdate(result.eventId()).orElseThrow();
        if (!command.getBookingId().equals(result.bookingId())
                || !command.getCustomerId().equals(result.customerId())
                || command.getRoomChangeVersion() != result.roomChangeVersion()
                || !equalMoney(command.getNewBookingTotal(), result.newWholeBookingTotal())
                || !equalMoney(command.getExpectedNetRetainedAmount(), result.expectedNetRetainedAmount())) {
            throw new IllegalStateException("FINANCIAL_RESULT_COMMAND_MISMATCH");
        }
        // Compare semantic JSON, not whitespace, and retain the first immutable result.
        String payload = mapper.writeValueAsString(result);
        if (command.getResultPayload() != null) {
            if (!mapper.readTree(command.getResultPayload()).equals(mapper.readTree(payload))) {
                throw new IllegalStateException("FINANCIAL_RESULT_REPLAY_MISMATCH");
            }
            return;
        }
        if (result.roomChangeVersion() < booking.getRoomChangeFinancialVersion()) return;
        if ("CONFIRMED".equals(result.outcome())) {
            if (result.creditedAmount() == null || result.netRetainedAmount() == null
                    || result.creditedAmount().signum() < 0 || result.creditedAmount().stripTrailingZeros().scale() > 0
                    || !equalMoney(result.netRetainedAmount(), result.expectedNetRetainedAmount().subtract(result.creditedAmount()))) {
                throw new IllegalArgumentException("INVALID_FINANCIAL_RESULT_NET");
            }
        } else if (!"RECONCILIATION_REQUIRED".equals(result.outcome())
                || result.creditedAmount() != null || result.netRetainedAmount() != null) {
            throw new IllegalArgumentException("INVALID_FINANCIAL_RESULT_OUTCOME");
        }
        booking.applyRoomChangeFinancialResult(result.roomChangeVersion(), result.expectedNetRetainedAmount(),
                result.newWholeBookingTotal(), result.creditedAmount(), result.outcome());
        command.recordResult(payload);
        // Booking financial state and immutable received result commit atomically.
        bookings.save(booking); outbox.save(command);
    }
    private boolean equalMoney(BigDecimal expected, BigDecimal actual) {
        return actual != null && expected.compareTo(actual) == 0;
    }
}
