package com.smarthotel.booking.booking.entity;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BookingRoomChangeWalletCreditTest {

    @Test
    void legacyPathStillRejectsRoomCheaperThanAmountAlreadyPaid() {
        Booking booking = fullyPaidBooking();

        assertThatThrownBy(() -> booking.applyRoomChange(
                UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("600000"), BigDecimal.ZERO, BigDecimal.ZERO
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("rẻ hơn số tiền khách đã thanh toán");

        assertThat(booking.getTotalPrice()).isEqualByComparingTo("1000000");
    }

    @Test
    void enabledPathAppliesCheaperRoomAndLeavesReconciliationToPaymentService() {
        Booking booking = fullyPaidBooking();

        booking.applyRoomChange(
                UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("600000"), BigDecimal.ZERO, BigDecimal.ZERO, true
        );

        assertThat(booking.getTotalPrice()).isEqualByComparingTo("600000");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1000000");
        assertThat(booking.getRoomChangeReconciliationState()).isEqualTo("PENDING");
        assertThat(booking.getRemainingAmount()).isZero();
        assertThat(booking.getPaymentStatus()).isEqualTo(BookingPaymentStatus.PAID);
        assertThat(booking.getRoomChangeFinancialVersion()).isEqualTo(1L);
    }

    @Test
    void cheaperThenMoreExpensiveRoomRequiresThePreviouslyCreditedDifferenceAgain() {
        Booking booking = fullyPaidBooking();

        booking.applyRoomChange(
                UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("600000"), BigDecimal.ZERO, BigDecimal.ZERO, true
        );
        booking.applyRoomChangeFinancialResult(1, new BigDecimal("1000000"), new BigDecimal("600000"),
                new BigDecimal("400000"), "CONFIRMED");
        booking.applyRoomChange(
                UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("800000"), BigDecimal.ZERO, BigDecimal.ZERO, true
        );

        assertThat(booking.getTotalPrice()).isEqualByComparingTo("800000");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("600000");
        assertThat(booking.getRemainingAmount()).isEqualByComparingTo("200000");
        assertThat(booking.getPaidAmount().add(booking.getRemainingAmount()))
                .isEqualByComparingTo(booking.getTotalPrice());
        assertThat(booking.getPaymentStatus()).isEqualTo(BookingPaymentStatus.PARTIALLY_PAID);
        assertThat(booking.getRoomChangeFinancialVersion()).isEqualTo(2L);

        booking.applyRoomChangeFinancialResult(2, new BigDecimal("600000"), new BigDecimal("800000"),
                BigDecimal.ZERO, "CONFIRMED");

        booking.applyPayment(new BigDecimal("200000"), BookingPaymentType.REMAINING_PAYMENT);

        assertThat(booking.getPaidAmount()).isEqualByComparingTo("800000");
        assertThat(booking.getRemainingAmount()).isZero();
        assertThat(booking.getPaymentStatus()).isEqualTo(BookingPaymentStatus.PAID);
    }

    @Test
    void moreExpensiveRoomKeepsLegacyAdditionalPaymentBehavior() {
        Booking booking = fullyPaidBooking();

        booking.applyRoomChange(
                UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("1200000"), BigDecimal.ZERO, BigDecimal.ZERO
        );

        assertThat(booking.getTotalPrice()).isEqualByComparingTo("1200000");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1000000");
        assertThat(booking.getRemainingAmount()).isEqualByComparingTo("200000");
        assertThat(booking.getPaymentStatus()).isEqualTo(BookingPaymentStatus.PARTIALLY_PAID);
        assertThat(booking.getRoomChangeFinancialVersion()).isZero();
    }

    @Test
    void delayedResultPreservesPaidAndBlocksBothDirectionsAndPayment() {
        Booking booking = fullyPaidBooking();
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("600000"), BigDecimal.ZERO, BigDecimal.ZERO, true);
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1000000");
        assertThat(booking.getEffectivePaidAfterWalletReconciliation()).isEqualByComparingTo("1000000");
        assertThat(booking.getPaymentDueAmount()).isZero();
        for (String total : new String[]{"950000", "400000", "1200000"}) {
            assertThatThrownBy(() -> booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(),
                    new BigDecimal(total), BigDecimal.ZERO, BigDecimal.ZERO, true)).hasMessageContaining("RECONCILIATION_REQUIRED");
        }
        assertThatThrownBy(() -> booking.applyPayment(new BigDecimal("300000"), BookingPaymentType.REMAINING_PAYMENT))
                .hasMessageContaining("RECONCILIATION_REQUIRED");
    }

    @Test
    void failClosedDoesNotAssumeCreditOrChargeAnotherRoomChange() {
        Booking booking = fullyPaidBooking();
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("800000"), BigDecimal.ZERO, BigDecimal.ZERO, true);
        booking.applyRoomChangeFinancialResult(1, new BigDecimal("1000000"), new BigDecimal("800000"), null, "RECONCILIATION_REQUIRED");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1000000");
        assertThat(booking.getRoomChangeReconciliationState()).isEqualTo("RECONCILIATION_REQUIRED");
        assertThat(booking.getPaymentDueAmount()).isZero();
        assertThatThrownBy(() -> booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(),
                new BigDecimal("950000"), BigDecimal.ZERO, BigDecimal.ZERO, true)).hasMessageContaining("RECONCILIATION_REQUIRED");
    }

    @Test
    void requiredTwoMillionSequenceReducesPaidOnlyOnEachConfirmation() {
        Booking booking = fullyPaidBooking();
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("2000000"), BigDecimal.ZERO, BigDecimal.ZERO);
        booking.applyPayment(new BigDecimal("1000000"), BookingPaymentType.REMAINING_PAYMENT);
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1600000"), BigDecimal.ZERO, BigDecimal.ZERO, true);
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("2000000");
        booking.applyRoomChangeFinancialResult(1, new BigDecimal("2000000"), new BigDecimal("1600000"), new BigDecimal("400000"), "CONFIRMED");
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1400000"), BigDecimal.ZERO, BigDecimal.ZERO, true);
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1600000");
        booking.applyRoomChangeFinancialResult(2, new BigDecimal("1600000"), new BigDecimal("1400000"), new BigDecimal("200000"), "CONFIRMED");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("1400000");
    }

    @Test
    void failClosedTwoMillionExampleNeverInventsThreeHundredThousandDue() {
        Booking booking = fullyPaidBooking();
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("2000000"), BigDecimal.ZERO, BigDecimal.ZERO);
        booking.applyPayment(new BigDecimal("1000000"), BookingPaymentType.REMAINING_PAYMENT);
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1600000"), BigDecimal.ZERO, BigDecimal.ZERO, true);
        booking.applyRoomChangeFinancialResult(1, new BigDecimal("2000000"), new BigDecimal("1600000"), null, "RECONCILIATION_REQUIRED");
        assertThat(booking.getPaidAmount()).isEqualByComparingTo("2000000");
        assertThatThrownBy(() -> booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1900000"),
                BigDecimal.ZERO, BigDecimal.ZERO, true)).hasMessageContaining("RECONCILIATION_REQUIRED");
        assertThatThrownBy(() -> booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1400000"),
                BigDecimal.ZERO, BigDecimal.ZERO, true)).hasMessageContaining("RECONCILIATION_REQUIRED");
        assertThat(booking.getPaymentDueAmount()).isZero();
    }

    private Booking fullyPaidBooking() {
        Booking booking = new Booking(
                "EZR-ROOM-CHANGE", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), LocalDate.now().plusDays(10),
                LocalDate.now().plusDays(12), 2, 0, new BigDecimal("1000000"),
                PaymentOption.PAY_AT_HOTEL, null, null,
                "Test", "Customer", "customer@example.com", "0900000000", null,
                true, true, null, null, null, null,
                false, null, null, null, null, true
        );
        booking.applyPayment(new BigDecimal("1000000"), BookingPaymentType.REMAINING_PAYMENT);
        return booking;
    }
}
