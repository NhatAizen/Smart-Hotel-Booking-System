package com.smarthotel.payment.wallet.roomchange;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Authoritative Payment-side financial position for one immutable room-change event.
 * Booking supplies the target total and ordering identity; Payment supplies every
 * settled-money and previously-issued-credit value.
 */
public record RoomChangeSettlementPosition(
        UUID bookingId,
        long roomChangeVersion,
        BigDecimal validSettledPayments,
        BigDecimal priorSuccessfulRoomChangeCredits,
        BigDecimal netRetainedForBooking,
        BigDecimal newWholeBookingTotal,
        BigDecimal incrementalCreditDue,
        BigDecimal additionalPaymentDue
) {}
