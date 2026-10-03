package com.smarthotel.payment.wallet.roomchange;

import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payos.PayOsPayoutClient;
import com.smarthotel.payment.payos.PayOsApiClient;
import com.smarthotel.payment.payos.config.PayOsProperties;
import com.smarthotel.payment.integration.hotel.HotelClient;
import com.smarthotel.payment.payment.service.PaymentService;
import com.smarthotel.payment.wallet.service.HotelCustomerWalletTransferService;
import com.smarthotel.payment.wallet.service.RoleChangePaymentFinalityGuard;
import com.smarthotel.payment.refund.entity.RefundRequest;
import com.smarthotel.payment.refund.repository.RefundRequestRepository;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.repository.HotelCustomerTransferRepository;
import com.smarthotel.payment.wallet.service.HotelAdminDemotionFenceService;
import com.smarthotel.payment.wallet.service.WalletService;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import com.smarthotel.payment.wallet.repository.WalletTransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:room_change_credit;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.show-sql=false",
        "features.room-change-customer-wallet-credit-enabled=true",
        "spring.flyway.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({
        RoomChangeCreditService.class,
        RoomChangeReconciliationService.class,
        RoomChangeCreditServiceTest.JsonConfig.class,
        BookingFinancialLockService.class,
        WalletService.class,
        PaymentService.class,
        HotelCustomerWalletTransferService.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class RoomChangeCreditServiceTest {
    @org.springframework.boot.test.context.TestConfiguration
    static class JsonConfig {
        @org.springframework.context.annotation.Bean
        com.fasterxml.jackson.databind.ObjectMapper mapper() {
            return new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        }
    }
    @Autowired RoomChangeReconciliationService reconciliation;
    @Autowired RoomChangeResultOutboxRepository resultOutbox;
    @Autowired RoomChangeCreditService service;
    @Autowired WalletService walletService;
    @Autowired PaymentService paymentService;
    @Autowired HotelCustomerWalletTransferService transferService;
    @Autowired PaymentRepository payments;
    @Autowired WalletRepository wallets;
    @Autowired WalletTransactionRepository transactions;
    @Autowired RefundRequestRepository refundRequests;
    @Autowired HotelCustomerTransferRepository hotelCustomerTransfers;
    @Autowired JdbcTemplate jdbc;
    @MockBean NotificationClient notificationClient;
    @MockBean BookingClient bookingClient;
    @MockBean PayOsPayoutClient payoutClient;
    @MockBean HotelAdminDemotionFenceService hotelAdminDemotionFenceService;
    @MockBean HotelClient hotelClient;
    @MockBean PayOsApiClient payOsClient;
    @MockBean PayOsProperties payOsProperties;
    @MockBean RoleChangePaymentFinalityGuard roleChangePaymentFinalityGuard;

    @BeforeEach
    void prepareInbox() {
        resultOutbox.deleteAll();
        transactions.deleteAll();
        hotelCustomerTransfers.deleteAll();
        refundRequests.deleteAll();
        wallets.deleteAll();
        payments.deleteAll();
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS booking_financial_locks (
                    booking_id UUID PRIMARY KEY,
                    last_room_change_version BIGINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """);
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS financial_event_inbox (
                    id UUID PRIMARY KEY,
                    operation_type VARCHAR(60) NOT NULL,
                    operation_id UUID NOT NULL,
                    booking_id UUID NOT NULL,
                    customer_id UUID NOT NULL,
                    room_change_version BIGINT NOT NULL,
                    new_booking_total NUMERIC(16,2) NOT NULL,
                    expected_net_retained_amount NUMERIC(16,2) NOT NULL,
                    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    correlation_id VARCHAR(160),
                    valid_paid_amount NUMERIC(16,2),
                    credited_amount NUMERIC(16,2),
                    processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    CONSTRAINT uq_test_financial_event UNIQUE (operation_type, operation_id),
                    CONSTRAINT uq_test_financial_booking_version
                        UNIQUE (operation_type, booking_id, room_change_version)
                )
                """);
        jdbc.update("DELETE FROM financial_event_inbox");
        jdbc.update("DELETE FROM booking_financial_locks");
    }

    @Test
    void creditsExactExcessOnceAndWritesAuditedLedger() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        UUID eventId = UUID.randomUUID();
        RoomChangeFinancialCommand command = command(eventId, bookingId, customerId, "600000");

        RoomChangeCreditResult first = service.process(command);
        RoomChangeCreditResult replay = null;
        for (int retry = 0; retry < 5; retry++) {
            replay = service.process(command);
        }

        assertThat(first.creditedAmount()).isEqualByComparingTo("400000");
        assertThat(replay.idempotentReplay()).isTrue();
        assertThat(balance(customerId)).isEqualByComparingTo("400000");
        var entries = transactions.findAll().stream()
                .filter(item -> item.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT
                        && "ROOM_CHANGE".equals(item.getReferenceType()))
                .toList();
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).getBalanceBefore()).isEqualByComparingTo("0");
        assertThat(entries.get(0).getBalanceAfter()).isEqualByComparingTo("400000");
        assertThat(entries.get(0).getReferenceType()).isEqualTo("ROOM_CHANGE");
        assertThat(entries.get(0).getReferenceId()).isEqualTo(eventId.toString());
        assertThat(entries.get(0).getIdempotencyKey()).isEqualTo("ROOM_CHANGE_CREDIT:" + eventId);
    }

    @Test
    void cumulativeSequenceCreditsOnlyIncrementalExcessAcrossRepeatedChangesAndPayments() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Instant initialPaymentAt = Instant.parse("2026-09-30T01:00:00Z");
        settledAt(bookingId, customerId, "2000000", initialPaymentAt);

        RoomChangeFinancialCommand firstCheaper = command(
                UUID.randomUUID(), 1L, bookingId, customerId, "1600000",
                Instant.parse("2026-09-30T02:00:00Z")
        );
        RoomChangeFinancialCommand secondCheaper = command(
                UUID.randomUUID(), 2L, bookingId, customerId, "1400000",
                Instant.parse("2026-09-30T03:00:00Z")
        );
        RoomChangeFinancialCommand moreExpensive = command(
                UUID.randomUUID(), 3L, bookingId, customerId, "1900000",
                Instant.parse("2026-09-30T04:00:00Z")
        );

        RoomChangeCreditResult first = service.process(firstCheaper);
        secondCheaper = expected(secondCheaper, "1600000");
        moreExpensive = expected(moreExpensive, "1400000");
        RoomChangeCreditResult second = service.process(secondCheaper);
        BigDecimal balanceAfterSecond = balance(customerId);
        RoomChangeCreditResult secondReplay = service.process(secondCheaper);
        RoomChangeSettlementPosition beforeUpgrade =
                service.getRoomChangeSettlementPosition(moreExpensive);
        RoomChangeCreditResult third = service.process(moreExpensive);

        assertThat(first.creditedAmount()).isEqualByComparingTo("400000");
        assertThat(second.creditedAmount()).isEqualByComparingTo("200000");
        assertThat(secondReplay.idempotentReplay()).isTrue();
        assertThat(balance(customerId)).isEqualByComparingTo(balanceAfterSecond);
        assertThat(beforeUpgrade.validSettledPayments()).isEqualByComparingTo("2000000");
        assertThat(beforeUpgrade.priorSuccessfulRoomChangeCredits()).isEqualByComparingTo("600000");
        assertThat(beforeUpgrade.netRetainedForBooking()).isEqualByComparingTo("1400000");
        assertThat(beforeUpgrade.incrementalCreditDue()).isZero();
        assertThat(beforeUpgrade.additionalPaymentDue()).isEqualByComparingTo("500000");
        assertThat(third.creditedAmount()).isZero();

        settledAt(
                bookingId, customerId, "300000",
                Instant.parse("2026-09-30T05:00:00Z")
        );
        RoomChangeFinancialCommand cheaperAgain = command(
                UUID.randomUUID(), 4L, bookingId, customerId, "1500000",
                Instant.parse("2026-09-30T06:00:00Z")
        );
        RoomChangeSettlementPosition finalPosition =
                service.getRoomChangeSettlementPosition(cheaperAgain);
        RoomChangeCreditResult fourth = service.process(cheaperAgain);

        assertThat(finalPosition.validSettledPayments()).isEqualByComparingTo("2300000");
        assertThat(finalPosition.priorSuccessfulRoomChangeCredits()).isEqualByComparingTo("600000");
        assertThat(finalPosition.netRetainedForBooking()).isEqualByComparingTo("1700000");
        assertThat(finalPosition.incrementalCreditDue()).isEqualByComparingTo("200000");
        assertThat(finalPosition.additionalPaymentDue()).isZero();
        assertThat(fourth.creditedAmount()).isEqualByComparingTo("200000");
        assertThat(balance(customerId)).isEqualByComparingTo("800000");
    }

    @Test
    void equalThenMoreExpensiveTargetsAfterFirstCreditIssueNoAdditionalCredit() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "2000000");

        RoomChangeCreditResult first = service.process(command(
                UUID.randomUUID(), 1L, bookingId, customerId, "1600000"
        ));
        RoomChangeCreditResult equal = service.process(command(
                UUID.randomUUID(), 2L, bookingId, customerId, "1600000"
        ));
        RoomChangeFinancialCommand moreExpensiveCommand = command(
                UUID.randomUUID(), 3L, bookingId, customerId, "1900000"
        );
        RoomChangeSettlementPosition position =
                service.getRoomChangeSettlementPosition(moreExpensiveCommand);
        RoomChangeCreditResult moreExpensive = service.process(moreExpensiveCommand);

        assertThat(first.creditedAmount()).isEqualByComparingTo("400000");
        assertThat(equal.creditedAmount()).isZero();
        assertThat(moreExpensive.creditedAmount()).isZero();
        assertThat(position.netRetainedForBooking()).isEqualByComparingTo("1600000");
        assertThat(position.additionalPaymentDue()).isEqualByComparingTo("300000");
        assertThat(balance(customerId)).isEqualByComparingTo("400000");
    }

    @Test
    void concurrentDuplicateDeliveryMutatesWalletAndLedgerExactlyOnce() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        RoomChangeFinancialCommand command = command(
                UUID.randomUUID(), 1L, bookingId, customerId, "600000"
        );
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> first = pool.submit(() -> runAfter(
                    start, () -> service.process(command)
            ));
            Future<Throwable> second = pool.submit(() -> runAfter(
                    start, () -> service.process(command)
            ));
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS)).isNull();
            assertThat(second.get(10, TimeUnit.SECONDS)).isNull();
            assertThat(balance(customerId)).isEqualByComparingTo("400000");
            assertThat(transactions.findAll()).filteredOn(item ->
                    item.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT
                            && "ROOM_CHANGE".equals(item.getReferenceType()))
                    .hasSize(1);
            assertThat(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                    Long.class, command.eventId()
            )).isEqualTo(1L);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void excludesUnsettledPayments() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        pending(bookingId, customerId, "900000");
        Payment failed = pending(bookingId, customerId, "100000");
        failed.markFailed("provider rejected");
        payments.save(failed);
        Payment cancelled = pending(bookingId, customerId, "100000");
        cancelled.markCancelled("customer cancelled");
        payments.save(cancelled);
        Payment expired = pending(bookingId, customerId, "100000");
        expired.markExpired();
        payments.save(expired);
        RoomChangeCreditResult result = service.process(command(
                UUID.randomUUID(), bookingId, customerId, "100000"
        ));

        assertThat(result.validSettledAmount()).isEqualByComparingTo("0");
        assertThat(result.creditedAmount()).isEqualByComparingTo("0");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
    }

    @Test
    void refundedPaymentExposureFailsClosedWithoutInboxOrWalletMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment refunded = settled(bookingId, customerId, "1000000");
        refunded.refund();
        payments.saveAndFlush(refunded);
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "600000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
        assertThat(wallets.findByOwnerTypeAndOwnerId(
                WalletOwnerType.CUSTOMER, customerId
        )).isEmpty();
    }

    @Test
    void activeRefundRequestFailsClosedBeforeWalletMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        refundRequests.saveAndFlush(new RefundRequest(
                bookingId,
                "EZR-REFUND-GUARD",
                customerId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "CONFIRMED",
                "FULL_PAYMENT",
                "CUSTOMER_REQUEST",
                "guard fixture",
                "FULL_REFUND",
                "manual review pending",
                new BigDecimal("1000000"),
                new BigDecimal("1000000"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "ACB",
                "123456789",
                "CUSTOMER TEST"
        ));
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "600000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
    }

    @Test
    void existingHotelCustomerTransferFailsClosedBeforeWalletMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        jdbc.update("""
                INSERT INTO hotel_customer_transfers (
                    id, booking_id, hotel_id, customer_id, amount, status, completed_at
                ) VALUES (?, ?, ?, ?, 400000, 'COMPLETED', CURRENT_TIMESTAMP)
                """, UUID.randomUUID(), bookingId, UUID.randomUUID(), customerId);
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "600000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
    }

    @Test
    void cashPaymentExposureFailsClosedWithoutInboxOrWalletMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment cash = new Payment(
                bookingId,
                customerId,
                new BigDecimal("1000000"),
                PaymentMethod.CASH,
                PaymentType.FULL_PAYMENT
        );
        cash.markPaid("CASH-" + cash.getId());
        ReflectionTestUtils.setField(cash, "paidAt", Instant.now().minusSeconds(1));
        payments.saveAndFlush(cash);
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "600000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
        assertThat(wallets.findByOwnerTypeAndOwnerId(
                WalletOwnerType.CUSTOMER, customerId
        )).isEmpty();
    }

    @Test
    void releasedHotelRevenueExposureFailsClosedWithoutInboxOrWalletMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment released = settled(bookingId, customerId, "1000000");
        released.markWalletApplied();
        released.markRevenueReleased();
        payments.saveAndFlush(released);
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "600000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
        assertThat(wallets.findByOwnerTypeAndOwnerId(
                WalletOwnerType.CUSTOMER, customerId
        )).isEmpty();
    }

    @Test
    void supportsSplitPaymentsAndDoesNotCreditSameSettledExposureAcrossRoomChanges() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "400000");
        settled(bookingId, customerId, "600000");

        RoomChangeCreditResult first = service.process(command(
                UUID.randomUUID(), 1L, bookingId, customerId, "600000"
        ));
        RoomChangeCreditResult second = service.process(command(
                UUID.randomUUID(), 2L, bookingId, customerId, "400000"
        ));

        assertThat(first.creditedAmount()).isEqualByComparingTo("400000");
        assertThat(second.validSettledAmount()).isEqualByComparingTo("1000000");
        assertThat(second.creditedAmount()).isEqualByComparingTo("200000");
        assertThat(balance(customerId)).isEqualByComparingTo("600000");
    }

    @Test
    void rejectsCustomerMismatchAndRollsBackInboxClaim() {
        UUID bookingId = UUID.randomUUID();
        UUID actualCustomer = UUID.randomUUID();
        UUID claimedCustomer = UUID.randomUUID();
        settled(bookingId, actualCustomer, "500000");
        UUID eventId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, claimedCustomer, "100000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("không sở hữu");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();
    }

    @Test
    void duplicateEventWithDifferentPayloadIsRejectedWithoutSecondMutation() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        settled(bookingId, customerId, "500000");
        service.process(command(eventId, bookingId, customerId, "300000"));

        assertThatThrownBy(() -> service.process(command(
                eventId, bookingId, customerId, "200000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DUPLICATE_FINANCIAL_OPERATION");
        assertThat(balance(customerId)).isEqualByComparingTo("200000");
    }

    @Test
    void duplicateEventWithDifferentFinancialCutoffIsRejected() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Instant occurredAt = Instant.now().plusSeconds(2);
        settled(bookingId, customerId, "500000");
        service.process(command(
                eventId, 1L, bookingId, customerId, "300000", occurredAt
        ));

        assertThatThrownBy(() -> service.process(command(
                eventId, 1L, bookingId, customerId, "300000", occurredAt.plusSeconds(1)
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DUPLICATE_FINANCIAL_OPERATION");
        assertThat(balance(customerId)).isEqualByComparingTo("200000");
    }

    @Test
    void settlementNotYetVisibleRollsBackClaimAndSameEventCanRetryAfterPaymentCommit() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Instant occurredAt = Instant.now().plusSeconds(5);
        RoomChangeFinancialCommand command = new RoomChangeFinancialCommand(
                eventId, eventId, 1L, bookingId, customerId,
                new BigDecimal("300000"), new BigDecimal("500000"),
                occurredAt, "commit-order-race"
        );

        assertThatThrownBy(() -> service.process(command))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SETTLEMENT_NOT_YET_VISIBLE");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox WHERE operation_id = ?",
                Long.class, eventId
        )).isZero();

        settledAt(bookingId, customerId, "500000", occurredAt.minusSeconds(1));
        RoomChangeCreditResult retried = service.process(command);

        assertThat(retried.creditedAmount()).isEqualByComparingTo("200000");
        assertThat(balance(customerId)).isEqualByComparingTo("200000");
    }

    @Test
    void newerVersionCannotPassASequenceGapAndCanBeRetriedAfterItsPredecessor() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        RoomChangeFinancialCommand versionOne = command(
                UUID.randomUUID(), 1L, bookingId, customerId, "400000"
        );
        RoomChangeFinancialCommand versionTwo = command(
                UUID.randomUUID(), 2L, bookingId, customerId, "800000"
        );
        versionTwo = expected(versionTwo, "400000");
        RoomChangeFinancialCommand retryableVersionTwo = versionTwo;

        assertThatThrownBy(() -> service.process(retryableVersionTwo))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SEQUENCE_GAP");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox", Long.class
        )).isZero();

        RoomChangeCreditResult first = service.process(versionOne);
        RoomChangeCreditResult second = service.process(versionTwo);

        assertThat(first.creditedAmount()).isEqualByComparingTo("600000");
        assertThat(second.creditedAmount()).isZero();
        assertThat(balance(customerId)).isEqualByComparingTo("600000");
        assertThat(jdbc.queryForObject("""
                SELECT last_room_change_version FROM booking_financial_locks
                WHERE booking_id = ?
                """, Long.class, bookingId)).isEqualTo(2L);
    }

    @Test
    void differentEventCannotReuseAnAlreadyProcessedBookingVersion() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "500000");
        service.process(command(UUID.randomUUID(), 1L, bookingId, customerId, "300000"));

        assertThatThrownBy(() -> service.process(command(
                UUID.randomUUID(), 1L, bookingId, customerId, "200000"
        ))).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("roomChangeVersion");

        assertThat(balance(customerId)).isEqualByComparingTo("200000");
        assertThat(transactions.findAll()).filteredOn(item ->
                item.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT
                        && "ROOM_CHANGE".equals(item.getReferenceType())).hasSize(1);
    }

    @Test
    void delayedOlderEventDoesNotCountPaymentsSettledAfterItOccurred() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Instant firstPaymentAt = Instant.parse("2026-09-30T01:00:00Z");
        Instant roomChangeAt = Instant.parse("2026-09-30T02:00:00Z");
        Instant laterPaymentAt = Instant.parse("2026-09-30T03:00:00Z");
        settledAt(bookingId, customerId, "1000000", firstPaymentAt);
        settledAt(bookingId, customerId, "400000", laterPaymentAt);

        RoomChangeCreditResult result = service.process(command(
                UUID.randomUUID(), 1L, bookingId, customerId, "800000", roomChangeAt
        ));

        assertThat(result.validSettledAmount()).isEqualByComparingTo("1000000");
        assertThat(result.creditedAmount()).isEqualByComparingTo("200000");
        assertThat(balance(customerId)).isEqualByComparingTo("200000");
    }

    @Test
    void laterVersionUsesOnlyIncrementAboveCumulativeCreditAlreadyIssued() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Instant firstPaymentAt = Instant.parse("2026-09-30T01:00:00Z");
        Instant firstChangeAt = Instant.parse("2026-09-30T02:00:00Z");
        Instant additionalPaymentAt = Instant.parse("2026-09-30T03:00:00Z");
        Instant secondChangeAt = Instant.parse("2026-09-30T04:00:00Z");
        settledAt(bookingId, customerId, "1000000", firstPaymentAt);

        RoomChangeCreditResult first = service.process(command(
                UUID.randomUUID(), 1L, bookingId, customerId, "600000", firstChangeAt
        ));
        settledAt(bookingId, customerId, "200000", additionalPaymentAt);
        RoomChangeCreditResult second = service.process(command(
                UUID.randomUUID(), 2L, bookingId, customerId, "700000", secondChangeAt
        ));

        assertThat(first.creditedAmount()).isEqualByComparingTo("400000");
        assertThat(second.validSettledAmount()).isEqualByComparingTo("1200000");
        assertThat(second.creditedAmount()).isEqualByComparingTo("100000");
        assertThat(balance(customerId)).isEqualByComparingTo("500000");
    }

    @Test
    void malformedCommandIsRejectedBeforeAnyInboxMutation() {
        UUID eventId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();

        assertThatThrownBy(() -> service.process(new RoomChangeFinancialCommand(
                eventId, UUID.randomUUID(), 1L, bookingId, customerId,
                new BigDecimal("100000.50"), BigDecimal.ZERO,
                Instant.now(), "bad-command"
        ))).isInstanceOf(IllegalArgumentException.class);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM financial_event_inbox", Long.class
        )).isZero();
    }

    @Test
    void distinctConcurrentEventsForOneBookingCannotOverCreditSettledExposure() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        RoomChangeFinancialCommand versionOne = command(
                UUID.randomUUID(), 1L, bookingId, customerId, "600000"
        );
        RoomChangeFinancialCommand versionTwo = command(
                UUID.randomUUID(), 2L, bookingId, customerId, "400000"
        );
        RoomChangeFinancialCommand retryableVersionTwo = expected(versionTwo, "600000");
        jdbc.update("""
                INSERT INTO booking_financial_locks (
                    booking_id, last_room_change_version, created_at
                ) VALUES (?, 0, CURRENT_TIMESTAMP)
                """, bookingId);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> first = pool.submit(() -> runAfter(start, () -> service.process(
                    versionOne)));
            Future<Throwable> second = pool.submit(() -> runAfter(start, () -> service.process(
                    retryableVersionTwo)));
            start.countDown();

            assertThat(first.get(10, TimeUnit.SECONDS)).isNull();
            Throwable secondOutcome = second.get(10, TimeUnit.SECONDS);
            if (secondOutcome != null) {
                assertThat(secondOutcome).hasMessageContaining("SEQUENCE_GAP");
                service.process(retryableVersionTwo);
            }
            assertThat(balance(customerId)).isEqualByComparingTo("600000");
            assertThat(transactions.findAll()).filteredOn(item ->
                    item.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT
                            && "ROOM_CHANGE".equals(item.getReferenceType()))
                    .hasSize(2);
            assertThat(jdbc.queryForObject("""
                    SELECT COUNT(*) FROM financial_event_inbox
                    WHERE operation_type = 'ROOM_CHANGE_CREDIT'
                      AND booking_id = ?
                      AND credited_amount IS NOT NULL
                    """, Long.class, bookingId)).isEqualTo(2L);
            assertThat(jdbc.queryForObject("""
                    SELECT last_room_change_version FROM booking_financial_locks
                    WHERE booking_id = ?
                    """, Long.class, bookingId)).isEqualTo(2L);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void concurrentCreditAndRevenueReleaseCannotBothSettleSameBookingExposure()
            throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        UUID hotelOwnerId = UUID.randomUUID();
        Payment payment = new Payment(
                null,
                bookingId,
                customerId,
                hotelId,
                hotelOwnerId,
                new BigDecimal("1000000"),
                PaymentMethod.PAYOS,
                PaymentType.FULL_PAYMENT,
                new BigDecimal("10")
        );
        payment.markPaid("PAYOS-RACE-" + payment.getId());
        payment.markWalletApplied();
        payment.markBookingApplied();
        ReflectionTestUtils.setField(payment, "paidAt", Instant.now().minusSeconds(1));
        payments.saveAndFlush(payment);

        Wallet hotelWallet = new Wallet(WalletOwnerType.HOTEL_ADMIN, hotelOwnerId);
        hotelWallet.creditPending(payment.getHotelNetAmount());
        wallets.saveAndFlush(hotelWallet);
        jdbc.update("""
                INSERT INTO booking_financial_locks (
                    booking_id, last_room_change_version, created_at
                ) VALUES (?, 0, CURRENT_TIMESTAMP)
                """, bookingId);

        RoomChangeFinancialCommand command = command(
                UUID.randomUUID(), 1L, bookingId, customerId, "600000"
        );
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> creditOutcome = pool.submit(() -> runAfter(
                    start, () -> service.process(command)
            ));
            Future<Throwable> releaseOutcome = pool.submit(() -> runAfter(
                    start, () -> walletService.releaseHotelRevenue(payment.getId(), true)
            ));
            start.countDown();

            var outcomes = java.util.Arrays.asList(
                    creditOutcome.get(10, TimeUnit.SECONDS),
                    releaseOutcome.get(10, TimeUnit.SECONDS)
            );
            assertThat(outcomes).filteredOn(item -> item == null).hasSize(1);

            Payment refreshed = payments.findById(payment.getId()).orElseThrow();
            BigDecimal customerBalance = wallets.findByOwnerTypeAndOwnerId(
                    WalletOwnerType.CUSTOMER, customerId
            ).map(Wallet::getAvailableBalance).orElse(BigDecimal.ZERO);
            if (refreshed.isRevenueReleased()) {
                assertThat(customerBalance).isZero();
            } else {
                assertThat(customerBalance).isEqualByComparingTo("400000");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private Throwable runAfter(CountDownLatch start, Runnable operation) throws InterruptedException {
        start.await();
        try {
            operation.run();
            return null;
        } catch (RuntimeException exception) {
            return exception;
        }
    }

    @Test
    void concurrentCreditAndActualRefundCannotBothCompensateBooking() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment payment = backedPayment(bookingId, customerId);
        Wallet platform = new Wallet(WalletOwnerType.PLATFORM, Wallet.PLATFORM_OWNER_ID);
        platform.topUpAvailable(payment.getCommissionAmount());
        wallets.saveAndFlush(platform);
        Wallet hotel = new Wallet(WalletOwnerType.HOTEL_ADMIN, payment.getHotelOwnerId());
        hotel.creditPending(payment.getHotelNetAmount());
        wallets.saveAndFlush(hotel);
        RoomChangeFinancialCommand command = command(UUID.randomUUID(), bookingId, customerId, "600000");

        race(bookingId, () -> service.process(command),
                () -> paymentService.refundComponentForApprovedRequest(payment.getId()));

        Payment refreshed = payments.findById(payment.getId()).orElseThrow();
        assertThat(balance(customerId)).isEqualByComparingTo(
                refreshed.getStatus() == com.smarthotel.payment.payment.entity.PaymentStatus.REFUNDED
                        ? "1000000" : "400000");
        assertThat(transactions.findAll()).filteredOn(entry ->
                entry.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT).hasSize(1);
    }

    @Test
    void concurrentCreditAndActualHotelTransferCannotBothCompensateBooking() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        UUID hotelId = UUID.randomUUID();
        Wallet hotel = new Wallet(WalletOwnerType.HOTEL, hotelId);
        hotel.topUpAvailable(new BigDecimal("400000"));
        wallets.saveAndFlush(hotel);
        RoomChangeFinancialCommand command = command(UUID.randomUUID(), bookingId, customerId, "600000");

        race(bookingId, () -> service.process(command), () -> transferService.transfer(
                UUID.randomUUID(), bookingId, hotelId, customerId, new BigDecimal("400000")));

        assertThat(balance(customerId)).isEqualByComparingTo("400000");
        assertThat(transactions.findAll()).filteredOn(entry ->
                entry.getType() == WalletTransactionType.CUSTOMER_REFUND_CREDIT
                        || entry.getType() == WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT).hasSize(1);
    }

    @Test
    void unaccountedPaidAmountCannotCreateUnbackedCustomerCredit() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Payment payment = pending(bookingId, customerId, "1000000");
        payment.markPaid("UNACCOUNTED-" + payment.getId());
        payments.saveAndFlush(payment);
        assertThatThrownBy(() -> service.process(command(
                UUID.randomUUID(), bookingId, customerId, "600000")))
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM financial_event_inbox", Long.class)).isZero();
    }

    @Test
    void paymentPositionAheadOfBookingSnapshotFailsClosed() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        RoomChangeFinancialCommand command = expected(command(
                UUID.randomUUID(), bookingId, customerId, "600000"), "800000");
        assertThatThrownBy(() -> service.process(command))
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
    }

    @Test
    void completedRefundRequestBlocksEvenWithoutRefundedPaymentMarker() {
        UUID bookingId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        RefundRequest request = new RefundRequest(bookingId, "COMPLETED", customerId,
                UUID.randomUUID(), UUID.randomUUID(), "CANCELLED", "FULL_PAYMENT",
                "CUSTOMER_REQUEST", null, "FULL_REFUND", "test", new BigDecimal("1000000"),
                new BigDecimal("1000000"), BigDecimal.ZERO, BigDecimal.ZERO, null, null, null);
        request.approve(request.getHotelOwnerId(), "approved");
        request.markPlatformRefunded();
        refundRequests.saveAndFlush(request);
        assertThatThrownBy(() -> service.process(command(
                UUID.randomUUID(), bookingId, customerId, "600000")))
                .hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");
    }

    @Test
    void successfulCreditAndDurableResultAreAtomicAndDuplicateCommandReplays() {
        UUID bookingId = UUID.randomUUID(), customerId = UUID.randomUUID();
        settled(bookingId, customerId, "2000000");
        var first = command(UUID.randomUUID(), bookingId, customerId, "1600000");
        reconciliation.settle(first);
        reconciliation.settle(first);
        assertThat(balance(customerId)).isEqualByComparingTo("400000");
        assertThat(resultOutbox.count()).isEqualTo(1);
        assertThat(resultOutbox.findById(first.eventId()).orElseThrow().getResultPayload()).contains("CONFIRMED", "1600000");
        var second = command(UUID.randomUUID(), 2, bookingId, customerId, "1400000");
        reconciliation.settle(second);
        reconciliation.settle(second);
        assertThat(balance(customerId)).isEqualByComparingTo("600000");
        assertThat(resultOutbox.count()).isEqualTo(2);
    }

    @Test
    void zeroCreditStillProducesDurableConfirmation() {
        UUID bookingId = UUID.randomUUID(), customerId = UUID.randomUUID();
        settled(bookingId, customerId, "1000000");
        var command = command(UUID.randomUUID(), bookingId, customerId, "1200000");
        reconciliation.settle(command);
        assertThat(resultOutbox.findById(command.eventId()).orElseThrow().getResultPayload()).contains("CONFIRMED", "1000000");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
    }

    @Test
    void unsafePositionRollsBackCreditThenFailureResultFreezesAutomaticReplay() {
        UUID bookingId = UUID.randomUUID(), customerId = UUID.randomUUID();
        Payment payment = settled(bookingId, customerId, "2000000");
        payment.markRevenueReleased(); payments.saveAndFlush(payment);
        var command = command(UUID.randomUUID(), bookingId, customerId, "1600000");
        assertThatThrownBy(() -> reconciliation.settle(command)).hasMessageContaining("RECONCILIATION_REQUIRED");
        assertThat(resultOutbox.count()).isZero();
        reconciliation.reconciliationRequired(command);
        reconciliation.settle(command);
        assertThat(resultOutbox.findById(command.eventId()).orElseThrow().getResultPayload()).contains("RECONCILIATION_REQUIRED");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM financial_event_inbox", Integer.class)).isZero();
    }

    @Test
    void resultOutboxInsertFailureRollsBackWalletInboxAndVersion() {
        UUID bookingId = UUID.randomUUID(), customerId = UUID.randomUUID();
        settled(bookingId, customerId, "2000000");
        var command = command(UUID.randomUUID(), bookingId, customerId, "1600000");
        var collision = command(UUID.randomUUID(), bookingId, customerId, "1600000");
        resultOutbox.saveAndFlush(new RoomChangeResultOutbox(collision, "fixture", "fixture"));
        assertThatThrownBy(() -> reconciliation.settle(command)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM financial_event_inbox", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_financial_locks WHERE booking_id = ?", Long.class, bookingId)).isZero();
    }

    private Payment backedPayment(UUID bookingId, UUID customerId) {
        Payment payment = new Payment(null, bookingId, customerId, UUID.randomUUID(),
                UUID.randomUUID(), new BigDecimal("1000000"), PaymentMethod.PAYOS,
                PaymentType.FULL_PAYMENT, new BigDecimal("10"));
        payment.markPaid("BACKED-" + payment.getId());
        payment.markWalletApplied();
        payment.markBookingApplied();
        ReflectionTestUtils.setField(payment, "paidAt", Instant.now().minusSeconds(1));
        return payments.saveAndFlush(payment);
    }

    private void race(UUID bookingId, Runnable firstOperation, Runnable secondOperation) throws Exception {
        jdbc.update("INSERT INTO booking_financial_locks (booking_id) VALUES (?)", bookingId);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> first = pool.submit(() -> runAfter(start, firstOperation));
            Future<Throwable> second = pool.submit(() -> runAfter(start, secondOperation));
            start.countDown();
            var outcomes = java.util.Arrays.asList(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertThat(outcomes).filteredOn(item -> item == null).hasSize(1);
            assertThat(outcomes).filteredOn(item -> item != null).allSatisfy(error -> {
                if (error instanceof com.smarthotel.payment.wallet.exception.FinancialOperationException financial) {
                    assertThat(financial.getCode()).isEqualTo("ROOM_CHANGE_RECONCILIATION_REQUIRED");
                } else {
                    assertThat(error).hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");
                }
            });
        } finally {
            pool.shutdownNow();
        }
    }

    private Payment settled(UUID bookingId, UUID customerId, String amount) {
        Payment payment = pending(bookingId, customerId, amount);
        payment.markPaid("TEST-" + payment.getId());
        payment.markWalletApplied();
        payment.markBookingApplied();
        // Keep the test payment unambiguously before the room-change event.
        // H2 rounds TIMESTAMP WITH TIME ZONE to database precision, so two
        // back-to-back Instant.now() calls can otherwise compare in reverse
        // after persistence even though the payment was created first.
        ReflectionTestUtils.setField(payment, "paidAt", Instant.now().minusSeconds(1));
        return payments.saveAndFlush(payment);
    }

    private Payment settledAt(
            UUID bookingId,
            UUID customerId,
            String amount,
            Instant paidAt
    ) {
        Payment payment = pending(bookingId, customerId, amount);
        payment.markPaid("TEST-" + payment.getId());
        payment.markWalletApplied();
        payment.markBookingApplied();
        ReflectionTestUtils.setField(payment, "paidAt", paidAt);
        return payments.saveAndFlush(payment);
    }

    private Payment pending(UUID bookingId, UUID customerId, String amount) {
        return payments.save(new Payment(
                bookingId,
                customerId,
                new BigDecimal(amount),
                PaymentMethod.PAYOS,
                PaymentType.FULL_PAYMENT
        ));
    }

    private RoomChangeFinancialCommand command(
            UUID eventId, UUID bookingId, UUID customerId, String total
    ) {
        return command(eventId, 1L, bookingId, customerId, total, Instant.now());
    }

    private RoomChangeFinancialCommand command(
            UUID eventId,
            long roomChangeVersion,
            UUID bookingId,
            UUID customerId,
            String total
    ) {
        return command(eventId, roomChangeVersion, bookingId, customerId, total, Instant.now());
    }

    private RoomChangeFinancialCommand command(
            UUID eventId,
            long roomChangeVersion,
            UUID bookingId,
            UUID customerId,
            String total,
            Instant occurredAt
    ) {
        BigDecimal settled = payments.sumAmountByBookingIdAndStatusAtOrBefore(
                bookingId, com.smarthotel.payment.payment.entity.PaymentStatus.PAID, occurredAt);
        BigDecimal prior = jdbc.queryForObject("""
                SELECT COALESCE(SUM(credited_amount), 0) FROM financial_event_inbox
                WHERE booking_id = ? AND room_change_version < ?
                """, BigDecimal.class, bookingId, roomChangeVersion);
        return new RoomChangeFinancialCommand(
                eventId, eventId, roomChangeVersion, bookingId, customerId,
                new BigDecimal(total), settled.subtract(prior).max(BigDecimal.ZERO),
                occurredAt, "test-correlation"
        );
    }

    private RoomChangeFinancialCommand expected(RoomChangeFinancialCommand command, String amount) {
        return new RoomChangeFinancialCommand(command.eventId(), command.roomChangeId(),
                command.roomChangeVersion(), command.bookingId(), command.customerId(),
                command.newWholeBookingTotal(), new BigDecimal(amount), command.occurredAt(),
                command.correlationId());
    }

    private BigDecimal balance(UUID customerId) {
        return wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)
                .orElseThrow().getAvailableBalance();
    }
}
