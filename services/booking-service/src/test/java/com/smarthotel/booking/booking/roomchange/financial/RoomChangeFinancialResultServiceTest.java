package com.smarthotel.booking.booking.roomchange.financial;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.booking.entity.*;
import com.smarthotel.booking.booking.repository.BookingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false"})
@Import({RoomChangeFinancialResultService.class, RoomChangeFinancialResultServiceTest.JsonConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class RoomChangeFinancialResultServiceTest {
    @TestConfiguration static class JsonConfig {
        @Bean ObjectMapper mapper() { return new ObjectMapper().findAndRegisterModules(); }
    }
    @Autowired BookingRepository bookings;
    @Autowired RoomChangeFinancialOutboxRepository outbox;
    @Autowired RoomChangeFinancialResultService service;
    private Booking booking;
    private RoomChangeFinancialOutboxEvent command;
    @BeforeEach void prepare() {
        outbox.deleteAll(); bookings.deleteAll();
        booking = new Booking("EZR-RESULT", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), LocalDate.now().plusDays(10), LocalDate.now().plusDays(12),
                2, 0, new BigDecimal("2000000"), PaymentOption.PAY_AT_HOTEL, null, null,
                "Test", "Customer", "customer@example.com", "0900000000", null, true, true,
                null, null, null, null, false, null, null, null, null, true);
        booking.applyPayment(new BigDecimal("2000000"), BookingPaymentType.REMAINING_PAYMENT);
        change("1600000");
    }
    private void change(String total) {
        BigDecimal paid = booking.getPaidAmount();
        booking.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal(total), BigDecimal.ZERO, BigDecimal.ZERO, true);
        booking = bookings.saveAndFlush(booking);
        command = outbox.saveAndFlush(new RoomChangeFinancialOutboxEvent(UUID.randomUUID(), booking.getId(),
                booking.getCustomerId(), booking.getTotalPrice(), paid, booking.getRoomChangeFinancialVersion(), Instant.now(), null));
    }
    private RoomChangeFinancialResult result(String outcome, String credit) {
        BigDecimal amount = credit == null ? null : new BigDecimal(credit);
        return new RoomChangeFinancialResult(command.getEventId(), booking.getId(), booking.getCustomerId(),
                command.getRoomChangeVersion(), command.getNewBookingTotal(), command.getExpectedNetRetainedAmount(),
                outcome, amount, amount == null ? null : command.getExpectedNetRetainedAmount().subtract(amount),
                amount == null ? "UNSAFE_FINANCIAL_POSITION" : null);
    }
    private Booking reload() { return bookings.findById(booking.getId()).orElseThrow(); }
    @Test void confirmationAloneReducesPaidAndCommitsReceivedAudit() throws Exception {
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("2000000");
        service.apply(result("CONFIRMED", "400000"));
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("1600000");
        assertThat(reload().getRoomChangeReconciliationState()).isEqualTo("CONFIRMED");
        assertThat(outbox.findById(command.getEventId()).orElseThrow().getResultPayload()).isNotNull();
    }
    @Test void zeroCreditConfirmationDoesNotInventPayment() throws Exception {
        service.apply(result("CONFIRMED", "400000"));
        booking = reload(); change("1900000");
        assertThat(reload().getPaymentDueAmount()).isZero();
        service.apply(result("CONFIRMED", "0"));
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("1600000");
        assertThat(reload().getPaymentDueAmount()).isEqualByComparingTo("300000");
    }
    @Test void failedResultPreservesTwoMillionAndBlocksBothNextChanges() throws Exception {
        service.apply(result("RECONCILIATION_REQUIRED", null));
        Booking actual = reload();
        assertThat(actual.getPaidAmount()).isEqualByComparingTo("2000000");
        assertThat(actual.getPaymentDueAmount()).isZero();
        for (String total : new String[]{"1900000", "1400000"}) {
            assertThatThrownBy(() -> actual.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal(total),
                    BigDecimal.ZERO, BigDecimal.ZERO, true)).hasMessageContaining("RECONCILIATION_REQUIRED");
        }
    }
    @Test void delayedResultKeepsPendingAndNoAssumedCredit() {
        assertThat(reload().getRoomChangeReconciliationState()).isEqualTo("PENDING");
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("2000000");
        assertThatThrownBy(() -> reload().requireResolvedRoomChangeFinancialPosition()).hasMessageContaining("RECONCILIATION_REQUIRED");
    }
    @Test void duplicateAndStaleResultDoNotOverwriteNewerPendingPosition() throws Exception {
        RoomChangeFinancialResult first = result("CONFIRMED", "400000");
        service.apply(first);
        Instant updated = reload().getUpdatedAt();
        service.apply(first);
        assertThat(reload().getUpdatedAt()).isEqualTo(updated);
        booking = reload(); change("1400000");
        service.apply(first);
        assertThat(reload().getRoomChangeReconciliationState()).isEqualTo("PENDING");
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("1600000");
        service.apply(result("CONFIRMED", "200000"));
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("1400000");
    }
    @Test void alteredReplayAndInvalidNetCannotMutateBooking() throws Exception {
        var valid = result("CONFIRMED", "400000");
        var wrong = new RoomChangeFinancialResult(valid.eventId(), valid.bookingId(), valid.customerId(), 1,
                valid.newWholeBookingTotal(), valid.expectedNetRetainedAmount(), "CONFIRMED", new BigDecimal("400000"), BigDecimal.ZERO, null);
        assertThatThrownBy(() -> service.apply(wrong)).hasMessageContaining("INVALID_FINANCIAL_RESULT_NET");
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("2000000");
        service.apply(valid);
        assertThatThrownBy(() -> service.apply(result("RECONCILIATION_REQUIRED", null))).hasMessageContaining("REPLAY_MISMATCH");
        assertThat(reload().getPaidAmount()).isEqualByComparingTo("1600000");
    }
    @Test void missingOrTamperedSignatureNeverCallsResultService() throws Exception {
        var mapper = new ObjectMapper().findAndRegisterModules();
        var signatures = new RoomChangeFinancialMessageSigner("booking-payment-financial-test-secret-32chars");
        var listener = new RoomChangeFinancialResultListener(mapper, signatures, service);
        byte[] body = mapper.writeValueAsBytes(result("CONFIRMED", "400000"));
        var message = org.springframework.amqp.core.MessageBuilder.withBody(body).build();
        assertThatThrownBy(() -> listener.receive(message)).isInstanceOf(SecurityException.class);
        message.getMessageProperties().setHeader("X-Enziu-Financial-Signature", signatures.sign("other".getBytes()));
        assertThatThrownBy(() -> listener.receive(message)).isInstanceOf(SecurityException.class);
        assertThat(reload().getRoomChangeReconciliationState()).isEqualTo("PENDING");
    }
}
