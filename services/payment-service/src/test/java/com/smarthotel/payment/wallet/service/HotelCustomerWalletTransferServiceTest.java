package com.smarthotel.payment.wallet.service;

import com.smarthotel.payment.wallet.entity.HotelCustomerTransferStatus;
import com.smarthotel.payment.wallet.entity.Wallet;
import com.smarthotel.payment.wallet.entity.WalletOwnerType;
import com.smarthotel.payment.wallet.entity.WalletTransactionType;
import com.smarthotel.payment.wallet.repository.HotelCustomerTransferRepository;
import com.smarthotel.payment.wallet.repository.WalletRepository;
import com.smarthotel.payment.wallet.repository.WalletTransactionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
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

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:hotel_wallet_transfer;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(HotelCustomerWalletTransferService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class HotelCustomerWalletTransferServiceTest {
    @Autowired HotelCustomerWalletTransferService service;
    @Autowired WalletRepository wallets;
    @Autowired WalletTransactionRepository transactions;
    @Autowired HotelCustomerTransferRepository transfers;
    @Autowired JdbcTemplate jdbc;

    @Test
    void transfersAvailableFundsOnceAndRecordsBalancedLedger() {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        fundHotel(hotelId, "500");

        var first = service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("200"));
        var retry = service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("200.00"));

        assertThat(first.getStatus()).isEqualTo(HotelCustomerTransferStatus.COMPLETED);
        assertThat(retry.getId()).isEqualTo(first.getId());
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("300");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("200");
        var entries = transactions.findAllByTransferIdOrderByCreatedAtAsc(operationId);
        assertThat(entries).hasSize(2);
        assertThat(entries).extracting(entry -> entry.getType()).containsExactlyInAnyOrder(
                WalletTransactionType.HOTEL_TO_CUSTOMER_DEBIT,
                WalletTransactionType.HOTEL_TO_CUSTOMER_CREDIT);
        assertThat(entries.stream().map(entry -> entry.getAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo("0");
    }

    @Test
    void cannotSpendLegacyAdminPoolOrPendingHotelRevenue() {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        Wallet legacy = new Wallet(WalletOwnerType.HOTEL_ADMIN, UUID.randomUUID());
        legacy.creditAvailable(new BigDecimal("500"));
        wallets.save(legacy);
        Wallet hotel = new Wallet(WalletOwnerType.HOTEL, hotelId);
        hotel.creditPending(new BigDecimal("500"));
        wallets.save(hotel);

        UUID operationId = UUID.randomUUID();
        assertThatThrownBy(() -> service.transfer(operationId, bookingId, hotelId,
                customerId, new BigDecimal("100")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("0");
        assertThat(balance(WalletOwnerType.HOTEL_ADMIN, legacy.getOwnerId()))
                .isEqualByComparingTo("500");
        assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
        assertThat(transfers.findById(operationId)).isEmpty();
    }

    @Test
    void cannotSpendAnotherHotelsAvailableBalance() {
        UUID fundedHotelId = UUID.randomUUID();
        UUID bookingHotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        fundHotel(fundedHotelId, "500");
        wallets.save(new Wallet(WalletOwnerType.HOTEL, bookingHotelId));

        UUID operationId = UUID.randomUUID();
        assertThatThrownBy(() -> service.transfer(operationId, UUID.randomUUID(),
                bookingHotelId, customerId, new BigDecimal("200")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(balance(WalletOwnerType.HOTEL, fundedHotelId)).isEqualByComparingTo("500");
        assertThat(balance(WalletOwnerType.HOTEL, bookingHotelId)).isEqualByComparingTo("0");
        assertThat(transfers.findById(operationId)).isEmpty();
    }

    @Test
    void oneAdminWithTwoHotelsKeepsThreeWalletsSeparate() {
        UUID adminId = UUID.randomUUID();
        UUID firstHotelId = UUID.randomUUID();
        UUID secondHotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        Wallet legacy = new Wallet(WalletOwnerType.HOTEL_ADMIN, adminId);
        legacy.creditAvailable(new BigDecimal("700"));
        wallets.save(legacy);
        fundHotel(firstHotelId, "200");
        fundHotel(secondHotelId, "300");

        service.transfer(UUID.randomUUID(), UUID.randomUUID(), firstHotelId,
                customerId, new BigDecimal("50"));

        assertThat(balance(WalletOwnerType.HOTEL, firstHotelId)).isEqualByComparingTo("150");
        assertThat(balance(WalletOwnerType.HOTEL, secondHotelId)).isEqualByComparingTo("300");
        assertThat(balance(WalletOwnerType.HOTEL_ADMIN, adminId)).isEqualByComparingTo("700");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("50");
    }

    @Test
    void failureAfterWalletChangesRollsBackBothWalletsAndTransferLedger() {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        fundHotel(hotelId, "500");
        jdbc.execute("ALTER TABLE wallet_transactions ADD CONSTRAINT reject_transfer_credit "
                + "CHECK (type <> 'HOTEL_TO_CUSTOMER_CREDIT' "
                + "OR transfer_id <> CAST('" + operationId + "' AS UUID))");
        try {
            assertThatThrownBy(() -> service.transfer(operationId, bookingId, hotelId,
                    customerId, new BigDecimal("200")))
                    .isInstanceOf(RuntimeException.class);
            assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("500");
            assertThat(wallets.findByOwnerTypeAndOwnerId(WalletOwnerType.CUSTOMER, customerId)).isEmpty();
            assertThat(transfers.findById(operationId)).isEmpty();
            assertThat(transactions.findAllByTransferIdOrderByCreatedAtAsc(operationId)).isEmpty();
        } finally {
            jdbc.execute("ALTER TABLE wallet_transactions DROP CONSTRAINT reject_transfer_credit");
        }
        service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("200"));
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("300");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("200");
    }

    @Test
    void operationIdCannotBeReusedForAnotherAmount() {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        fundHotel(hotelId, "500");
        service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("200"));

        assertThatThrownBy(() -> service.transfer(operationId, bookingId, hotelId,
                customerId, new BigDecimal("201")))
                .isInstanceOf(IllegalStateException.class);
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("300");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("200");
    }

    @RepeatedTest(3)
    void concurrentDifferentRequestsCannotOverdrawOneHotelWallet() throws Exception {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        fundHotel(hotelId, "100");

        var outcomes = concurrentCalls(
                () -> service.transfer(firstId, bookingId, hotelId, customerId, new BigDecimal("80")),
                () -> service.transfer(secondId, bookingId, hotelId, customerId, new BigDecimal("80"))
        );

        assertThat(outcomes).filteredOn(item -> item == null).hasSize(1);
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("20");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("80");
        long completed = java.util.stream.Stream.of(firstId, secondId)
                .filter(id -> transfers.findById(id).isPresent()).count();
        assertThat(completed).isEqualTo(1);
        assertThat(transactions.findAllByTransferIdOrderByCreatedAtAsc(firstId).size()
                + transactions.findAllByTransferIdOrderByCreatedAtAsc(secondId).size()).isEqualTo(2);
    }

    @RepeatedTest(3)
    void concurrentDifferentRequestsWithSufficientFundsBothCommit() throws Exception {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        fundHotel(hotelId, "200");

        var outcomes = concurrentCalls(
                () -> service.transfer(firstId, bookingId, hotelId, customerId, new BigDecimal("80")),
                () -> service.transfer(secondId, bookingId, hotelId, customerId, new BigDecimal("80"))
        );

        assertThat(outcomes).containsExactly(null, null);
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("40");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("160");
        assertThat(transactions.findAllByTransferIdOrderByCreatedAtAsc(firstId)).hasSize(2);
        assertThat(transactions.findAllByTransferIdOrderByCreatedAtAsc(secondId)).hasSize(2);
    }

    @RepeatedTest(3)
    void concurrentSameRequestIdNeverTransfersTwice() throws Exception {
        UUID hotelId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        fundHotel(hotelId, "100");

        var outcomes = concurrentCalls(
                () -> service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("40")),
                () -> service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("40"))
        );

        assertThat(outcomes).containsNull();
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("60");
        assertThat(balance(WalletOwnerType.CUSTOMER, customerId)).isEqualByComparingTo("40");
        assertThat(transactions.findAllByTransferIdOrderByCreatedAtAsc(operationId)).hasSize(2);
        assertThat(transfers.findById(operationId).orElseThrow().getStatus())
                .isEqualTo(HotelCustomerTransferStatus.COMPLETED);
        // A caller that saw a database conflict can retry the same stable ID.
        service.transfer(operationId, bookingId, hotelId, customerId, new BigDecimal("40"));
        assertThat(balance(WalletOwnerType.HOTEL, hotelId)).isEqualByComparingTo("60");
    }

    private java.util.List<Throwable> concurrentCalls(Runnable first, Runnable second) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Throwable> left = pool.submit(() -> runAfter(start, first));
            Future<Throwable> right = pool.submit(() -> runAfter(start, second));
            start.countDown();
            return java.util.Arrays.asList(left.get(10, TimeUnit.SECONDS), right.get(10, TimeUnit.SECONDS));
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

    private void fundHotel(UUID hotelId, String amount) {
        Wallet hotel = new Wallet(WalletOwnerType.HOTEL, hotelId);
        hotel.creditAvailable(new BigDecimal(amount));
        wallets.save(hotel);
    }

    private BigDecimal balance(WalletOwnerType type, UUID ownerId) {
        return wallets.findByOwnerTypeAndOwnerId(type, ownerId).orElseThrow().getAvailableBalance();
    }
}
