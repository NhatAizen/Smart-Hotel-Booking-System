package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.integration.booking.BookingClient;
import com.smarthotel.payment.integration.notification.NotificationClient;
import com.smarthotel.payment.payment.repository.PaymentRepository;
import com.smarthotel.payment.payos.PayOsPayoutClient;
import com.smarthotel.payment.payment.entity.Payment;
import com.smarthotel.payment.payment.entity.PaymentMethod;
import com.smarthotel.payment.payment.entity.PaymentType;
import com.smarthotel.payment.wallet.dto.CreateWithdrawalRequest;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import com.smarthotel.payment.wallet.entity.WithdrawalStatus;
import com.smarthotel.payment.wallet.exception.FinancialOperationException;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import com.smarthotel.payment.wallet.repository.WalletTransactionRepository;
import com.smarthotel.payment.wallet.repository.WithdrawalRequestRepository;
import com.smarthotel.payment.wallet.roomchange.BookingFinancialLockService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:customer_withdrawal_v13;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({WalletService.class, BookingFinancialLockService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CustomerWithdrawalV13Test {
    @Autowired WalletService service;
    @Autowired WalletRepository wallets;
    @Autowired WithdrawalRequestRepository withdrawals;
    @Autowired WalletTransactionRepository transactions;
    @Autowired JdbcTemplate jdbc;
    @MockBean PaymentRepository paymentRepository;
    @MockBean BookingClient bookingClient;
    @MockBean PayOsPayoutClient payoutClient;
    @MockBean NotificationClient notificationClient;
    @MockBean HotelAdminDemotionFenceService hotelAdminDemotionFenceService;

    @BeforeEach
    void cleanFinancialRows() {
        transactions.deleteAll();
        withdrawals.deleteAll();
        wallets.deleteAll();
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS financial_event_inbox (
                    operation_type VARCHAR(60) NOT NULL,
                    booking_id UUID NOT NULL,
                    credited_amount NUMERIC(16,2)
                )
                """);
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS booking_financial_locks (
                    booking_id UUID PRIMARY KEY,
                    last_room_change_version BIGINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """);
        jdbc.update("DELETE FROM financial_event_inbox");
        jdbc.update("DELETE FROM booking_financial_locks");
    }

    @Test
    void completedRoomChangeCreditBlocksAutomaticRefundOrRevenueSettlement() {
        UUID bookingId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO financial_event_inbox (
                    operation_type, booking_id, credited_amount
                ) VALUES ('ROOM_CHANGE_CREDIT', ?, 400000)
                """, bookingId);

        assertThatThrownBy(() -> service.assertNoRoomChangeCreditConflict(bookingId))
                .isInstanceOfSatisfying(FinancialOperationException.class, error ->
                        assertThat(error.getCode())
                                .isEqualTo("ROOM_CHANGE_RECONCILIATION_REQUIRED"));
    }

    @Test
    void completedRoomChangeCreditBlocksRevenueReleaseUnderSharedBookingLock() {
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
        payment.markPaid("PAYOS-REVENUE-GUARD");
        payment.markWalletApplied();
        when(paymentRepository.findBookingIdById(payment.getId()))
                .thenReturn(java.util.Optional.of(payment.getBookingId()));
        when(paymentRepository.findForUpdateById(payment.getId()))
                .thenReturn(java.util.Optional.of(payment));
        jdbc.update("""
                INSERT INTO financial_event_inbox (
                    operation_type, booking_id, credited_amount
                ) VALUES ('ROOM_CHANGE_CREDIT', ?, 400000)
                """, bookingId);

        assertThatThrownBy(() -> service.releaseHotelRevenue(payment.getId(), true))
                .isInstanceOfSatisfying(FinancialOperationException.class, error ->
                        assertThat(error.getCode())
                                .isEqualTo("ROOM_CHANGE_RECONCILIATION_REQUIRED"));

        assertThat(payment.isRevenueReleased()).isFalse();
        assertThat(wallets.findByOwnerTypeAndOwnerId(
                WalletOwnerType.HOTEL_ADMIN, hotelOwnerId
        )).isEmpty();
    }

    @Test
    void duplicateCreateKeyReturnsSameWithdrawalAndReservesOnce() {
        UUID customerId = UUID.randomUUID();
        fund(customerId, "500000");
        CreateWithdrawalRequest request = request("200000");

        var first = service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER, request, "customer-request-1"
        );
        var retry = service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER, request, "customer-request-1"
        );

        assertThat(retry.id()).isEqualTo(first.id());
        assertThat(withdrawals.count()).isEqualTo(1);
        assertThat(wallet(customerId).getAvailableBalance()).isEqualByComparingTo("300000");
        assertThat(wallet(customerId).getLockedBalance()).isEqualByComparingTo("200000");
        assertThat(transactions.findAll()).filteredOn(item ->
                item.getType() == WalletTransactionType.WITHDRAWAL_HOLD).hasSize(1);
        var hold = transactions.findAll().stream().filter(item ->
                item.getType() == WalletTransactionType.WITHDRAWAL_HOLD).findFirst().orElseThrow();
        assertThat(hold.getBalanceBefore()).isEqualByComparingTo("500000");
        assertThat(hold.getBalanceAfter()).isEqualByComparingTo("300000");
        assertThat(hold.getReferenceType()).isEqualTo("WITHDRAWAL");
        assertThat(hold.getActorType()).isEqualTo("CUSTOMER");
    }

    @Test
    void sameCreateKeyCannotBeReusedForDifferentAmount() {
        UUID customerId = UUID.randomUUID();
        fund(customerId, "500000");
        service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-request-2");

        assertThatThrownBy(() -> service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER,
                request("210000"), "customer-request-2"
        )).isInstanceOfSatisfying(FinancialOperationException.class, error ->
                assertThat(error.getCode()).isEqualTo("DUPLICATE_FINANCIAL_OPERATION"));
        assertThat(wallet(customerId).getLockedBalance()).isEqualByComparingTo("200000");
    }

    @Test
    void customerAutomaticPayoutIsRejectedBeforePayOsInvocation() {
        UUID customerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        fund(customerId, "500000");
        var withdrawal = service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-request-3");

        assertThatThrownBy(() -> service.approve(
                withdrawal.id(), adminId, "approved", true
        )).isInstanceOf(FinancialOperationException.class)
                .hasMessageContaining("thủ công");
        assertThat(withdrawals.findById(withdrawal.id()).orElseThrow().getStatus())
                .isEqualTo(WithdrawalStatus.PENDING);
        verify(payoutClient, never()).createPayout(any());
    }

    @Test
    void invalidAndInsufficientAmountsCannotReserveCustomerFunds() {
        UUID customerId = UUID.randomUUID();
        fund(customerId, "500000");

        assertThatThrownBy(() -> service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER, request("0"), "zero-amount"
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER, request("-10000"), "negative-amount"
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.createWithdrawal(
                customerId, WalletOwnerType.CUSTOMER, request("600000"), "insufficient"
        )).isInstanceOfSatisfying(FinancialOperationException.class, error ->
                assertThat(error.getCode()).isEqualTo("INSUFFICIENT_WALLET_BALANCE"));

        assertThat(wallet(customerId).getAvailableBalance()).isEqualByComparingTo("500000");
        assertThat(wallet(customerId).getLockedBalance()).isZero();
        assertThat(withdrawals.count()).isZero();
    }

    @Test
    void rejectionReleasesReservedBalanceWithAuditedLedger() {
        UUID customerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        fund(customerId, "500000");
        var withdrawal = service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-request-reject");

        service.reject(withdrawal.id(), adminId, "manual review rejected");

        assertThat(wallet(customerId).getAvailableBalance()).isEqualByComparingTo("500000");
        assertThat(wallet(customerId).getLockedBalance()).isZero();
        var release = transactions.findAll().stream().filter(item ->
                item.getType() == WalletTransactionType.WITHDRAWAL_RELEASED).findFirst().orElseThrow();
        assertThat(release.getBalanceBefore()).isEqualByComparingTo("300000");
        assertThat(release.getBalanceAfter()).isEqualByComparingTo("500000");
        assertThat(release.getActorType()).isEqualTo("SYSTEM_ADMIN");
        assertThat(release.getActorId()).isEqualTo(adminId);
    }

    @Test
    void customerCannotReadAnotherCustomersWithdrawalDocument() {
        UUID customerId = UUID.randomUUID();
        fund(customerId, "500000");
        var withdrawal = service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-request-private");

        assertThatThrownBy(() -> service.getTransferProof(
                withdrawal.id(), UUID.randomUUID(), WalletOwnerType.CUSTOMER, false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("không có quyền");
    }

    @Test
    void ownerTypeIsPartOfWithdrawalReadAuthorization() {
        UUID sharedSubjectId = UUID.randomUUID();
        fund(sharedSubjectId, "500000");
        fundHotelAdmin(sharedSubjectId, "500000");

        var customerWithdrawal = service.createWithdrawal(
                sharedSubjectId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-owner-scope"
        );
        var hotelWithdrawal = service.createWithdrawal(
                sharedSubjectId, WalletOwnerType.HOTEL_ADMIN,
                request("100000"), "hotel-owner-scope"
        );

        assertThat(service.getMyWithdrawals(sharedSubjectId, WalletOwnerType.CUSTOMER))
                .extracting(item -> item.id())
                .containsExactly(customerWithdrawal.id());
        assertThat(service.getMyWithdrawals(sharedSubjectId, WalletOwnerType.HOTEL_ADMIN))
                .extracting(item -> item.id())
                .containsExactly(hotelWithdrawal.id());
        assertThat(service.getMyWithdrawalsPage(
                sharedSubjectId, WalletOwnerType.CUSTOMER, 0, 20
        ).getContent()).extracting(item -> item.id())
                .containsExactly(customerWithdrawal.id());

        assertThatThrownBy(() -> service.getTransferProof(
                customerWithdrawal.id(), sharedSubjectId, WalletOwnerType.HOTEL_ADMIN, false
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("không có quyền");
    }

    @Test
    void manualCompletionIsIdempotentAndFinalizesLockedBalanceOnce() {
        UUID customerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        fund(customerId, "500000");
        var withdrawal = service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                request("200000"), "customer-request-4");
        service.approve(withdrawal.id(), adminId, "manual settlement", false);
        MockMultipartFile proof = new MockMultipartFile(
                "transferProof", "proof.png", "image/png", new byte[]{1, 2, 3}
        );

        service.markPaid(withdrawal.id(), adminId, "BANK-REF-1", proof, "completion-1");
        service.markPaid(withdrawal.id(), adminId, "BANK-REF-1", null, "completion-1");

        Wallet wallet = wallet(customerId);
        assertThat(wallet.getAvailableBalance()).isEqualByComparingTo("300000");
        assertThat(wallet.getLockedBalance()).isEqualByComparingTo("0");
        assertThat(wallet.getTotalWithdrawn()).isEqualByComparingTo("200000");
        assertThat(transactions.findAll()).filteredOn(item ->
                item.getType() == WalletTransactionType.WITHDRAWAL_PAID).hasSize(1);

        assertThatThrownBy(() -> service.markPaid(
                withdrawal.id(), adminId, "BANK-REF-1", null, "completion-other"
        )).isInstanceOfSatisfying(FinancialOperationException.class, error ->
                assertThat(error.getCode()).isEqualTo("DUPLICATE_FINANCIAL_OPERATION"));
    }

    @Test
    void concurrentRequestsCannotOverspend() throws Exception {
        UUID customerId = UUID.randomUUID();
        fund(customerId, "500000");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> first = pool.submit(() -> runAfter(start, () ->
                    service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                            request("400000"), "concurrent-a")));
            Future<Throwable> second = pool.submit(() -> runAfter(start, () ->
                    service.createWithdrawal(customerId, WalletOwnerType.CUSTOMER,
                            request("200000"), "concurrent-b")));
            start.countDown();
            var outcomes = java.util.Arrays.asList(
                    first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)
            );

            assertThat(outcomes).filteredOn(item -> item == null).hasSize(1);
            Wallet wallet = wallet(customerId);
            assertThat(wallet.getAvailableBalance().add(wallet.getLockedBalance()))
                    .isEqualByComparingTo("500000");
            assertThat(wallet.getAvailableBalance()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
            assertThat(withdrawals.count()).isEqualTo(1);
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

    private void fund(UUID customerId, String amount) {
        Wallet wallet = new Wallet(WalletOwnerType.CUSTOMER, customerId);
        wallet.creditCustomerRefund(new BigDecimal(amount));
        wallets.save(wallet);
    }

    private void fundHotelAdmin(UUID ownerId, String amount) {
        Wallet wallet = new Wallet(WalletOwnerType.HOTEL_ADMIN, ownerId);
        wallet.creditAvailable(new BigDecimal(amount));
        wallets.save(wallet);
    }

    private Wallet wallet(UUID customerId) {
        return wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)
                .orElseThrow();
    }

    private CreateWithdrawalRequest request(String amount) {
        return new CreateWithdrawalRequest(
                new BigDecimal(amount), "ACB", "970416", "123456789", "CUSTOMER TEST"
        );
    }
}
