package com.smarthotel.booking.booking.roomchange.financial;

import com.smarthotel.booking.booking.entity.*;
import com.smarthotel.booking.booking.repository.BookingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.smarthotel.booking.booking.service.BookingService;
import com.smarthotel.booking.integration.hotel.HotelClient;
import java.time.LocalTime;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Two independent PostgreSQL transactions; never uses the production database. */
@EnabledIfEnvironmentVariable(named = "CI_BOOKING_MUTATION_POSTGRES", matches = "true")
@DataJpaTest(properties = {"spring.datasource.url=${BOOKING_MUTATION_DB_URL}",
        "spring.datasource.username=${BOOKING_MIGRATION_DB_USERNAME}",
        "spring.datasource.password=${BOOKING_MIGRATION_DB_PASSWORD}",
        "spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({BookingService.class, RoomChangeFinancialResultService.class, RoomChangeFinancialResultServiceTest.JsonConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class BookingMutationPostgresConcurrencyTest {
    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("BOOKING_MUTATION_DB_URL");
        // Validate BEFORE Hibernate can create/drop a schema, not after context startup.
        assertThat(url).matches("^jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/booking_mutation_ci$");
        registry.add("spring.datasource.url", () -> url);
    }
    @Autowired BookingRepository bookings;
    @Autowired RoomChangeFinancialOutboxRepository outbox;
    @Autowired PlatformTransactionManager transactions;
    @Autowired BookingService service;
    @Autowired RoomChangeFinancialResultService results;
    @Autowired com.smarthotel.booking.booking.roomchange.RoomChangeRequestRepository requests;
    @MockBean HotelClient hotels;
    @MockBean com.smarthotel.booking.booking.code.BookingCodeService codes;
    @MockBean com.smarthotel.booking.integration.notification.NotificationClient notifications;
    @MockBean com.smarthotel.booking.booking.hold.RoomHoldService holds;
    @MockBean com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService realtime;
    @MockBean com.smarthotel.booking.pricing.service.PricingService pricing;
    @MockBean com.smarthotel.booking.promotion.service.PromotionService promotions;
    @MockBean com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService fences;
    @MockBean com.smarthotel.booking.policy.service.PlatformPolicyService policy;
    private TransactionTemplate tx() { return new TransactionTemplate(transactions); }
    private Booking seed() {
        assertThat(System.getenv("BOOKING_MUTATION_DB_URL"))
                .matches("^jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/booking_mutation_ci$");
        Booking b = new Booking("EZR-" + UUID.randomUUID().toString().substring(0, 20), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                LocalDate.now(), LocalDate.now().plusDays(2), 2, 0, new BigDecimal("2000000"),
                PaymentOption.PAY_AT_HOTEL, null, null, "Test", "Customer", "test@example.com", "0900000000",
                null, true, true, null, null, null, null, false, null, null, null, null, true);
        b.applyPayment(new BigDecimal("2000000"), BookingPaymentType.REMAINING_PAYMENT);
        b.recordManualIdentityVerification(true, true, 30, b.getHotelId());
        when(hotels.getHotel(any())).thenAnswer(inv -> new HotelClient.HotelDetails(inv.getArgument(0),
                b.getHotelId(), "Test", "Local", "Test", LocalTime.MIDNIGHT, LocalTime.NOON));
        when(hotels.getRoom(any())).thenAnswer(inv -> new HotelClient.RoomDetails(inv.getArgument(0), b.getHotelId(),
                b.getRoomTypeId(), "Test", 1, "AVAILABLE", null, null));
        when(hotels.getRoomType(any())).thenReturn(mock(HotelClient.RoomTypeDetails.class));
        when(pricing.lateCheckoutQuote(any(), any(), any())).thenReturn(
                new com.smarthotel.booking.pricing.service.PricingService.LateCheckoutQuote(false, 0, 0, false,
                        null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0, "Test", BigDecimal.ZERO, BigDecimal.ZERO));
        return bookings.saveAndFlush(b);
    }
    private void change(UUID id) {
        tx().executeWithoutResult(s -> {
            Booking b = bookings.findForUpdate(id).orElseThrow();
            BigDecimal paid = b.getPaidAmount();
            b.applyRoomChange(UUID.randomUUID(), UUID.randomUUID(), new BigDecimal("1600000"),
                    BigDecimal.ZERO, BigDecimal.ZERO, true);
            outbox.save(new RoomChangeFinancialOutboxEvent(UUID.randomUUID(), id, b.getCustomerId(),
                    b.getTotalPrice(), paid, b.getRoomChangeFinancialVersion(), Instant.now(), null));
        });
    }
    private static void await(CountDownLatch latch) {
        try { assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
    }
    @Test void staleCheckInCannotOverwriteCommittedPendingFinancialState() throws Exception {
        UUID id = seed().getId();
        CountDownLatch loaded = new CountDownLatch(1), resume = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> stale = executor.submit(() -> tx().executeWithoutResult(s -> {
                Booking b = bookings.findById(id).orElseThrow();
                loaded.countDown(); await(resume);
                b.checkIn();
            }));
            await(loaded); change(id);
            assertThat(bookings.findById(id).orElseThrow().getRoomChangeReconciliationState()).isEqualTo("PENDING");
            resume.countDown();
            assertThatThrownBy(() -> stale.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .hasRootCauseInstanceOf(org.hibernate.StaleObjectStateException.class);
            Booking actual = bookings.findById(id).orElseThrow();
            // The exact pre-fix scenario previously reset NONE/version 0; @Version now rejects its commit.
            assertThat(actual.getRoomChangeReconciliationState()).isEqualTo("PENDING");
            assertThat(actual.getRoomChangeFinancialVersion()).isEqualTo(1);
            assertThat(actual.getPaidAmount()).isEqualByComparingTo("2000000");
            assertThat(actual.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
            assertThat(outbox.findAll().stream().filter(e -> e.getBookingId().equals(id))).hasSize(1);
        } finally { resume.countDown(); executor.shutdownNow(); }
    }

    @Test void roomChangeLocksFirstBothCheckInPathsWaitThenFailBeforeOccupied() throws Exception {
        for (boolean complete : new boolean[]{false, true}) {
            Booking original = seed(); UUID id = original.getId();
            CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1), started = new CountDownLatch(1);
            ExecutorService executor = Executors.newFixedThreadPool(2);
            try {
                Future<?> change = executor.submit(() -> tx().executeWithoutResult(s -> {
                    change(id); held.countDown(); await(release);
                }));
                await(held);
                Future<?> checkin = executor.submit(() -> {
                    started.countDown();
                    if (complete) service.completeCheckIn(original.getHotelId(), id, original.getCheckInCode(), "local-token");
                    else service.checkIn(original.getHotelId(), id, "local-token");
                });
                await(started);
                assertThatThrownBy(() -> checkin.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                release.countDown(); change.get(10, TimeUnit.SECONDS);
                assertThatThrownBy(() -> checkin.get(10, TimeUnit.SECONDS)).rootCause().hasMessageContaining("ROOM_CHANGE_RECONCILIATION_REQUIRED");
                verify(hotels, never()).updateRoomStatus(any(), eq("OCCUPIED"), any());
                assertThat(bookings.findById(id).orElseThrow().getRoomChangeReconciliationState()).isEqualTo("PENDING");
            } finally { release.countDown(); executor.shutdownNow(); }
        }
    }

    @Test void checkInLocksFirstRoomChangeWaitsThenSeesFreshCheckedInState() throws Exception {
        Booking original = seed(); UUID id = original.getId();
        CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1), started = new CountDownLatch(1);
        doAnswer(inv -> { held.countDown(); await(release); return null; })
                .when(hotels).updateRoomStatus(any(), eq("OCCUPIED"), any());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> checkin = executor.submit(() -> service.checkIn(original.getHotelId(), id, "local-token"));
            await(held);
            Future<?> roomchange = executor.submit(() -> { started.countDown(); change(id); });
            await(started);
            assertThatThrownBy(() -> roomchange.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); checkin.get(10, TimeUnit.SECONDS);
            assertThatThrownBy(() -> roomchange.get(10, TimeUnit.SECONDS))
                    .rootCause().isInstanceOf(IllegalStateException.class);
            assertThat(bookings.findById(id).orElseThrow().getStatus()).isEqualTo(BookingStatus.CHECKED_IN);
            assertThat(bookings.findById(id).orElseThrow().getRoomChangeFinancialVersion()).isZero();
            verify(hotels).updateRoomStatus(any(), eq("OCCUPIED"), eq("local-token"));
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    @Test void normalResolvedCheckInRemainsAllowed() {
        Booking b = seed();
        assertThat(service.verifyCheckIn(b.getHotelId(), b.getCheckInCode()).canCheckIn()).isTrue();
        service.completeCheckIn(b.getHotelId(), b.getId(), b.getCheckInCode(), "local-token");
        assertThat(bookings.findById(b.getId()).orElseThrow().getStatus()).isEqualTo(BookingStatus.CHECKED_IN);
        verify(hotels).updateRoomStatus(any(), eq("OCCUPIED"), eq("local-token"));
    }

    @Test void pendingCheckInDetailsNeverAdvertiseReadyForExternalCheckIn() {
        Booking b = seed(); change(b.getId());
        var details = service.verifyCheckIn(b.getHotelId(), b.getCheckInCode());
        assertThat(details.canCheckIn()).isFalse();
        assertThat(details.actionMessage()).contains("ROOM_CHANGE_RECONCILIATION_REQUIRED");
        verify(hotels, never()).updateRoomStatus(any(), any(), any());
    }

    @Test void resultConsumerLocksFirstCheckInCannotOverwriteConfirmedResult() throws Exception {
        Booking b = seed(); UUID id = b.getId();
        var request = tx().execute(s -> {
            Booking current = bookings.findForUpdate(id).orElseThrow();
            var r = new com.smarthotel.booking.booking.roomchange.RoomChangeRequest(id, b.getCustomerId(),
                    b.getHotelId(), b.getRoomId(), b.getRoomTypeId(), UUID.randomUUID(), b.getRoomTypeId(), "Test");
            current.applyRoomChange(r.getTargetRoomTypeId(), r.getTargetRoomId(), new BigDecimal("2000000"),
                    BigDecimal.ZERO, BigDecimal.ZERO, true);
            r.approve(b.getHotelId(), r.getTargetRoomId(), r.getTargetRoomTypeId(), b.getTotalPrice(),
                    current.getTotalPrice(), BigDecimal.ZERO, null, null); r.awaitFinancialConfirmation();
            requests.save(r);
            outbox.save(new RoomChangeFinancialOutboxEvent(r.getId(), id, b.getCustomerId(), current.getTotalPrice(),
                    b.getPaidAmount(), current.getRoomChangeFinancialVersion(), Instant.now(), null));
            return r;
        });
        CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> confirmed = executor.submit(() -> tx().executeWithoutResult(s -> {
                try { results.apply(new RoomChangeFinancialResult(request.getId(), id, b.getCustomerId(), 1,
                        new BigDecimal("2000000"), new BigDecimal("2000000"), "CONFIRMED", BigDecimal.ZERO,
                        new BigDecimal("2000000"), null)); }
                catch (Exception e) { throw new IllegalStateException(e); }
                held.countDown(); await(release);
            }));
            await(held);
            Future<?> checkin = executor.submit(() -> service.checkIn(b.getHotelId(), id, "local-token"));
            assertThatThrownBy(() -> checkin.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); confirmed.get(10, TimeUnit.SECONDS); checkin.get(10, TimeUnit.SECONDS);
            Booking actual = bookings.findById(id).orElseThrow();
            assertThat(actual.getRoomChangeReconciliationState()).isEqualTo("CONFIRMED");
            assertThat(actual.getRoomChangeFinancialVersion()).isEqualTo(1);
            assertThat(actual.getStatus()).isEqualTo(BookingStatus.CHECKED_IN);
            assertThat(requests.findById(request.getId()).orElseThrow().getFinancialReconciliationStatus()).isEqualTo("CONFIRMED");
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    @Test void cancellationAndPaymentFailureTakeSharedLockAndPreservePendingFields() throws Exception {
        for (boolean cancel : new boolean[]{true, false}) {
            Booking original = seed(); UUID id = original.getId();
            CountDownLatch held = new CountDownLatch(1), release = new CountDownLatch(1);
            ExecutorService executor = Executors.newFixedThreadPool(2);
            try {
                Future<?> change = executor.submit(() -> tx().executeWithoutResult(s -> { change(id); held.countDown(); await(release); }));
                await(held);
                Future<?> mutation = executor.submit(() -> {
                    if (cancel) service.cancel(original.getCustomerId(), id); else service.markPaymentFailed(id);
                });
                assertThatThrownBy(() -> mutation.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                release.countDown(); change.get(10, TimeUnit.SECONDS); mutation.get(10, TimeUnit.SECONDS);
                Booking actual = bookings.findById(id).orElseThrow();
                assertThat(actual.getRoomChangeReconciliationState()).isEqualTo("PENDING");
                assertThat(actual.getRoomChangeFinancialVersion()).isEqualTo(1);
                assertThat(actual.getPaidAmount()).isEqualByComparingTo("2000000");
            } finally { release.countDown(); executor.shutdownNow(); }
        }
    }
}
