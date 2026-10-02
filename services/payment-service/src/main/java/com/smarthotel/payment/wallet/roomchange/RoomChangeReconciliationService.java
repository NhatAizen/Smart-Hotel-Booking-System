package com.smarthotel.payment.wallet.roomchange;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Credit/inbox/version AND the immutable result outbox commit in one DB transaction. */
@Service
@ConditionalOnProperty(name = "features.room-change-customer-wallet-credit-enabled", havingValue = "true")
public class RoomChangeReconciliationService {
    private final RoomChangeCreditService creditService;
    private final BookingFinancialLockService locks;
    private final RoomChangeResultOutboxRepository outbox;
    private final ObjectMapper mapper;
    public RoomChangeReconciliationService(RoomChangeCreditService creditService,
            BookingFinancialLockService locks, RoomChangeResultOutboxRepository outbox, ObjectMapper mapper) {
        this.creditService = creditService; this.locks = locks; this.outbox = outbox; this.mapper = mapper;
    }
    @Transactional
    public void settle(RoomChangeFinancialCommand command) {
        locks.lock(command.bookingId());
        if (alreadyRecorded(command)) return;
        RoomChangeCreditResult credit = creditService.process(command);
        record(command, new RoomChangeFinancialResult(command.eventId(), command.bookingId(), command.customerId(),
                command.roomChangeVersion(), command.newWholeBookingTotal(), command.expectedNetRetainedAmount(),
                "CONFIRMED", credit.creditedAmount(), command.expectedNetRetainedAmount().subtract(credit.creditedAmount()), null));
    }
    /** Called only after settle's failed transaction has rolled back. No credit is claimed. */
    @Transactional
    public void reconciliationRequired(RoomChangeFinancialCommand command) {
        locks.lock(command.bookingId());
        if (alreadyRecorded(command)) return;
        record(command, new RoomChangeFinancialResult(command.eventId(), command.bookingId(), command.customerId(),
                command.roomChangeVersion(), command.newWholeBookingTotal(), command.expectedNetRetainedAmount(),
                "RECONCILIATION_REQUIRED", null, null, "UNSAFE_FINANCIAL_POSITION"));
    }
    private boolean alreadyRecorded(RoomChangeFinancialCommand command) {
        return outbox.findById(command.eventId()).map(existing -> {
            if (!existing.getCommandPayload().equals(json(command))) {
                throw new IllegalStateException("DUPLICATE_FINANCIAL_OPERATION: result command payload mismatch");
            }
            return true;
        }).orElse(false);
    }
    private void record(RoomChangeFinancialCommand command, RoomChangeFinancialResult result) {
        outbox.saveAndFlush(new RoomChangeResultOutbox(command, json(command), json(result)));
    }
    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception exception) { throw new IllegalStateException("Cannot serialize durable financial result", exception); }
    }
}
