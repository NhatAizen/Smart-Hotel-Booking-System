package com.smarthotel.booking.integration.pricing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.common.exception.RoomAlreadyBookedException;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.booking.service.BookingService;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.membership.dto.MembershipProfileResponse;
import com.smarthotel.booking.policy.service.PlatformPolicyService;
import com.smarthotel.booking.pricing.dto.PricingQuoteRequest;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.promotion.service.PromotionService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.time.DayOfWeek;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real Flyway/PostgreSQL booking writes and real Redis locks, with only external services stubbed. */
@EnabledIfEnvironmentVariable(named = "CI_DAILY_PRICING_INTEGRATION", matches = "true")
@SpringBootTest(properties = {"pricing.manual-daily-customer-enabled=true",
        "booking.hold.cleanup-delay-ms=3600000", "spring.rabbitmq.listener.simple.auto-startup=false"})
@AutoConfigureMockMvc
class CustomerDailyPricingPostgresRedisIntegrationTest {
    private static HttpServer identityServer;

    @DynamicPropertySource
    static void identityStub(DynamicPropertyRegistry registry) {
        registry.add("IDENTITY_SERVICE_URL", CustomerDailyPricingPostgresRedisIntegrationTest::identityUrl);
    }

    private static synchronized String identityUrl() {
        if (identityServer == null) {
            try {
                identityServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
                identityServer.createContext("/api/users/me/role-snapshot", exchange -> {
                    String authorization = exchange.getRequestHeaders().getFirst("Authorization");
                    String role = "Bearer hotel-admin-token".equals(authorization)
                            ? "HOTEL_ADMIN"
                            : "CUSTOMER";
                    byte[] body = ("{\"role\":\"" + role + "\",\"active\":true}")
                            .getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, body.length);
                    try (var output = exchange.getResponseBody()) {
                        output.write(body);
                    }
                });
                identityServer.start();
            } catch (IOException exception) {
                throw new IllegalStateException("Cannot start synthetic Identity stub", exception);
            }
        }
        return "http://127.0.0.1:" + identityServer.getAddress().getPort();
    }

    @AfterAll
    static void stopIdentityStub() {
        if (identityServer != null) identityServer.stop(0);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @BeforeAll
    static void requireDisposableServices() {
        assertThat(System.getenv("DB_URL"))
                .isEqualTo("jdbc:postgresql://localhost:5432/booking_daily_ci");
        assertThat(System.getenv("DB_USERNAME")).isEqualTo("ci_daily");
        assertThat(System.getenv("REDIS_HOST")).isEqualTo("localhost");
    }

    @Autowired BookingService bookings;
    @Autowired BookingRepository bookingRows;
    @Autowired BookingNightPriceRepository nightRows;
    @Autowired PricingService pricing;
    @Autowired RoomHoldService holds;
    @Autowired StringRedisTemplate redis;
    @MockBean HotelClient hotel;
    @MockBean NotificationClient notifications;
    @MockBean AvailabilityRealtimeService realtime;
    @MockBean OwnerDemotionFenceService ownerFence;
    @MockBean PlatformPolicyService platformPolicy;
    @MockBean PromotionService promotions;

    UUID hotelId;
    UUID customerId;
    UUID ownerId;
    UUID typeId;
    UUID firstRoom;
    UUID secondRoom;
    LocalDate saturday;
    AtomicReference<List<HotelClient.CustomerDailyPrice>> dailyPrices;

    @BeforeEach
    void setup() {
        hotelId = UUID.randomUUID();
        customerId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        typeId = UUID.randomUUID();
        firstRoom = UUID.randomUUID();
        secondRoom = UUID.randomUUID();
        saturday = LocalDate.now().plusWeeks(2).with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
        dailyPrices = new AtomicReference<>(List.of(
                new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("750.00"))));

        var syntheticHotel = new HotelClient.HotelDetails(
                hotelId, ownerId, "CI Synthetic Hotel", "CI Street", "CI City", LocalTime.of(14, 0), LocalTime.NOON);
        when(hotel.getHotel(hotelId)).thenReturn(syntheticHotel);
        when(hotel.getManagedHotel(eq(hotelId), anyString())).thenReturn(syntheticHotel);
        when(hotel.getHotelPolicy(hotelId)).thenReturn(new HotelClient.HotelPolicyDetails(
                hotelId, LocalTime.of(14, 0), LocalTime.NOON, true, null, null, false, false,
                false, false, false, null, null, false, null, List.of(), true));
        when(hotel.getRoom(firstRoom)).thenReturn(room(firstRoom, "101", "900.00"));
        when(hotel.getRoom(secondRoom)).thenReturn(room(secondRoom, "102", "800.00"));
        when(hotel.getManagedRooms(eq(hotelId), anyString()))
                .thenReturn(List.of(room(firstRoom, "101", "900.00"), room(secondRoom, "102", "800.00")));
        when(hotel.getRoomType(typeId)).thenReturn(new HotelClient.RoomTypeDetails(
                typeId, hotelId, "Suite", null, new BigDecimal("1000.00"), 4, 2,
                "KING", 1, null, false, true, false, true, true, 30, true));
        when(hotel.getCustomerDailyPrices(eq(hotelId), eq(typeId), any(), any()))
                .thenAnswer(invocation -> dailyPrices.get());
        when(platformPolicy.minimumBookingAge()).thenReturn(18);
        when(promotions.plan(eq(customerId), eq(hotelId), any(), nullable(String.class), nullable(String.class)))
                .thenAnswer(invocation -> {
                    BigDecimal gross = invocation.getArgument(2);
                    BigDecimal zero = new BigDecimal("0.00");
                    return new PromotionService.DiscountPlan(
                            new MembershipProfileResponse(0, "CI", 0, zero, null, null, 0),
                            null, null, gross, zero, zero, zero, zero, gross, zero);
                });
    }

    @Test
    void quoteSingleRoomAndPersistedBookingAgreeAndStayImmutable() {
        var quote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom),
                saturday, saturday.plusDays(2)));
        assertThat(quote.totalAmount()).isEqualByComparingTo("1740.00");
        assertThat(quote.rooms().get(0).nights()).extracting(night -> night.pricingType())
                .containsExactly("MANUAL_DAILY", "WEEKEND");
        assertThat(quote.rooms().get(0).nights().get(0).surchargeAmount()).isEqualByComparingTo("0");

        var saved = bookings.create(single(firstRoom, saturday, quote.totalAmount(), quote.pricingFingerprint()));
        assertThat(saved.grossAmount()).isEqualByComparingTo(quote.totalAmount());
        assertThat(saved.totalPrice()).isEqualByComparingTo(quote.totalAmount());
        assertThat(nightRows.findAllByBookingIdOrderByStayDateAsc(saved.id()))
                .extracting(night -> night.getFinalPrice())
                .containsExactly(new BigDecimal("750.00"), new BigDecimal("990.00"));

        dailyPrices.set(List.of(new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("800.00"))));
        assertThat(bookings.getById(saved.id()).totalPrice()).isEqualByComparingTo("1740.00");
        assertThat(nightRows.findAllByBookingIdOrderByStayDateAsc(saved.id()).get(0).getFinalPrice())
                .isEqualByComparingTo("750.00");
    }

    @Test
    void multipleRoomsMatchQuoteAndSavedNightSnapshots() {
        var quote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom, secondRoom),
                saturday, saturday.plusDays(2)));
        assertThat(quote.totalAmount()).isEqualByComparingTo("3370.00");
        var saved = bookings.createBatch(batch(List.of(firstRoom, secondRoom), saturday,
                saturday.plusDays(2), null, quote.totalAmount(), quote.pricingFingerprint(), null));
        assertThat(saved).hasSize(2);
        assertThat(saved.stream().map(item -> item.grossAmount()).reduce(BigDecimal.ZERO, BigDecimal::add))
                .isEqualByComparingTo(quote.totalAmount());
        for (int index = 0; index < saved.size(); index++) {
            assertThat(nightRows.findAllByBookingIdOrderByStayDateAsc(saved.get(index).id()))
                    .extracting(night -> night.getFinalPrice())
                    .containsExactlyElementsOf(quote.rooms().get(index).nights().stream()
                            .map(night -> night.finalPrice()).toList());
        }
    }

    @Test
    void sameTotalDifferentNightPricesRequiresReconfirmationAndPreservesHoldAndCode() throws Exception {
        dailyPrices.set(List.of(
                new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("750.00")),
                new HotelClient.CustomerDailyPrice(saturday.plusDays(1), new BigDecimal("850.00"))));
        var oldQuote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom),
                saturday, saturday.plusDays(2)));
        UUID token = UUID.randomUUID();
        holds.acquire(token, customerId, hotelId, List.of(firstRoom), saturday, saturday.plusDays(2));
        dailyPrices.set(List.of(
                new HotelClient.CustomerDailyPrice(saturday, new BigDecimal("800.00")),
                new HotelClient.CustomerDailyPrice(saturday.plusDays(1), new BigDecimal("800.00"))));
        var refreshed = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom),
                saturday, saturday.plusDays(2)));
        assertThat(refreshed.totalAmount()).isEqualByComparingTo(oldQuote.totalAmount());
        assertThat(refreshed.pricingFingerprint()).isNotEqualTo(oldQuote.pricingFingerprint());
        long before = bookingRows.count();
        mvc.perform(post("/api/bookings/batch")
                        .with(jwt().jwt(value -> value.subject(customerId.toString())
                                        .claim("role", "CUSTOMER"))
                                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(batch(List.of(firstRoom), saturday,
                                saturday.plusDays(2), token, oldQuote.totalAmount(),
                                oldQuote.pricingFingerprint(), "KEEP10"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICE_CHANGED"));
        assertThat(bookingRows.count()).isEqualTo(before);
        assertThat(holds.getMetadata(token)).isNotNull();
        var accepted = bookings.createBatch(batch(List.of(firstRoom), saturday,
                saturday.plusDays(2), token, refreshed.totalAmount(), refreshed.pricingFingerprint(), "KEEP10"));
        assertThat(accepted).hasSize(1);
        verify(promotions, times(2)).plan(eq(customerId), eq(hotelId), any(), eq("KEEP10"), nullable(String.class));
    }

    @Test
    void calendarKeepsHoldAcrossPriceChangeAndReplacesItWithConfirmedBooking() throws Exception {
        var customerJwt = jwt().jwt(value -> value.subject(customerId.toString())
                        .claim("role", "CUSTOMER"))
                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
        var adminJwt = jwt().jwt(value -> value.tokenValue("hotel-admin-token")
                        .subject(ownerId.toString())
                        .claim("role", "HOTEL_ADMIN"))
                .authorities(new SimpleGrantedAuthority("ROLE_HOTEL_ADMIN"));

        var holdJson = mapper.readTree(mvc.perform(post("/api/availability/holds")
                        .with(customerJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new com.smarthotel.booking.booking.dto.CreateRoomHoldRequest(
                                hotelId, List.of(firstRoom), saturday, saturday.plusDays(2), null))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        UUID holdToken = UUID.fromString(holdJson.path("holdToken").asText());

        mvc.perform(get("/api/hotel-admin/hotels/{hotelId}/availability-calendar", hotelId)
                        .with(adminJwt)
                        .param("from", saturday.toString())
                        .param("to", saturday.plusDays(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.holds.length()").value(1))
                .andExpect(jsonPath("$.holds[0].roomId").value(firstRoom.toString()))
                .andExpect(jsonPath("$.bookings.length()").value(0));

        var oldQuote = mapper.readTree(mvc.perform(post("/api/pricing/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new PricingQuoteRequest(
                                hotelId, List.of(firstRoom), saturday, saturday.plusDays(2)))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        BigDecimal oldTotal = oldQuote.path("totalAmount").decimalValue();
        String oldFingerprint = oldQuote.path("pricingFingerprint").asText();

        dailyPrices.set(List.of(new HotelClient.CustomerDailyPrice(
                saturday, new BigDecimal("800.00"))));
        long bookingCountBefore = bookingRows.count();
        mvc.perform(post("/api/bookings/batch")
                        .with(customerJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(batch(List.of(firstRoom), saturday,
                                saturday.plusDays(2), holdToken, oldTotal, oldFingerprint, null))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICE_CHANGED"));
        assertThat(bookingRows.count()).isEqualTo(bookingCountBefore);

        mvc.perform(get("/api/hotel-admin/hotels/{hotelId}/availability-calendar", hotelId)
                        .with(adminJwt)
                        .param("from", saturday.toString())
                        .param("to", saturday.plusDays(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.holds.length()").value(1))
                .andExpect(jsonPath("$.holds[0].roomId").value(firstRoom.toString()))
                .andExpect(jsonPath("$.bookings.length()").value(0));

        var refreshedQuote = mapper.readTree(mvc.perform(post("/api/pricing/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(new PricingQuoteRequest(
                                hotelId, List.of(firstRoom), saturday, saturday.plusDays(2)))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        BigDecimal refreshedTotal = refreshedQuote.path("totalAmount").decimalValue();
        String refreshedFingerprint = refreshedQuote.path("pricingFingerprint").asText();
        assertThat(refreshedFingerprint).isNotEqualTo(oldFingerprint);

        mvc.perform(post("/api/bookings/batch")
                        .with(customerJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(batch(List.of(firstRoom), saturday,
                                saturday.plusDays(2), holdToken, refreshedTotal, refreshedFingerprint, null))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$[0].grossAmount").value(refreshedTotal.doubleValue()));

        mvc.perform(get("/api/hotel-admin/hotels/{hotelId}/availability-calendar", hotelId)
                        .with(adminJwt)
                        .param("from", saturday.toString())
                        .param("to", saturday.plusDays(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.holds.length()").value(0))
                .andExpect(jsonPath("$.bookings.length()").value(1))
                .andExpect(jsonPath("$.bookings[0].roomId").value(firstRoom.toString()))
                .andExpect(jsonPath("$.bookings[0].status").value("CONFIRMED"));
    }

    @Test
    void expiredHoldAndConcurrentClaimCannotCreateDuplicateBooking() throws Exception {
        var quote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom),
                saturday, saturday.plusDays(1)));
        UUID expiredToken = UUID.randomUUID();
        holds.acquire(expiredToken, customerId, hotelId, List.of(firstRoom), saturday, saturday.plusDays(1));
        redis.expire("enziu:booking:hold:meta:" + expiredToken, Duration.ofMillis(1));
        Thread.sleep(30);
        long before = bookingRows.count();
        assertThatThrownBy(() -> bookings.createBatch(batch(List.of(firstRoom), saturday,
                saturday.plusDays(1), expiredToken, quote.totalAmount(), quote.pricingFingerprint(), null)))
                .isInstanceOf(RoomHoldService.RoomHoldConflictException.class);
        assertThat(bookingRows.count()).isEqualTo(before);
        holds.releaseByBookingGroup(expiredToken);

        var gate = new CountDownLatch(1);
        UUID firstToken = UUID.randomUUID();
        UUID secondToken = UUID.randomUUID();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> claimAfterGate(gate, firstToken));
            var second = executor.submit(() -> claimAfterGate(gate, secondToken));
            gate.countDown();
            int successes = (first.get(10, TimeUnit.SECONDS) ? 1 : 0)
                    + (second.get(10, TimeUnit.SECONDS) ? 1 : 0);
            assertThat(successes).isEqualTo(1);
        } finally {
            holds.releaseByBookingGroup(firstToken);
            holds.releaseByBookingGroup(secondToken);
            executor.shutdownNow();
        }
    }

    @Test
    void simultaneousBookingRequestsPersistOnlyOneReservation() throws Exception {
        var quote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(firstRoom),
                saturday, saturday.plusDays(1)));
        long before = bookingRows.count();
        var gate = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> createAfterGate(gate, quote.totalAmount(),
                    quote.pricingFingerprint()));
            var second = executor.submit(() -> createAfterGate(gate, quote.totalAmount(),
                    quote.pricingFingerprint()));
            gate.countDown();
            int successes = (first.get(15, TimeUnit.SECONDS) ? 1 : 0)
                    + (second.get(15, TimeUnit.SECONDS) ? 1 : 0);
            assertThat(successes).isEqualTo(1);
            assertThat(bookingRows.count()).isEqualTo(before + 1);
        } finally {
            executor.shutdownNow();
        }
    }

    private boolean createAfterGate(CountDownLatch gate, BigDecimal gross, String fingerprint)
            throws InterruptedException {
        gate.await();
        try {
            bookings.createBatch(batch(List.of(firstRoom), saturday, saturday.plusDays(1),
                    null, gross, fingerprint, null));
            return true;
        } catch (RoomHoldService.RoomHoldConflictException | RoomAlreadyBookedException expected) {
            return false;
        }
    }

    private boolean claimAfterGate(CountDownLatch gate, UUID token) throws InterruptedException {
        gate.await();
        try {
            holds.acquire(token, customerId, hotelId, List.of(secondRoom), saturday, saturday.plusDays(1));
            return true;
        } catch (RoomHoldService.RoomHoldConflictException expected) {
            return false;
        }
    }

    private HotelClient.RoomDetails room(UUID id, String number, String customPrice) {
        return new HotelClient.RoomDetails(id, hotelId, typeId, number, 1, "AVAILABLE",
                new BigDecimal(customPrice), null);
    }

    private CreateBookingRequest single(UUID roomId, LocalDate checkIn, BigDecimal gross, String fingerprint) {
        return new CreateBookingRequest(customerId, hotelId, roomId, checkIn, checkIn.plusDays(2),
                1, 0, PaymentOption.PAY_AT_HOTEL, "CI", "Customer", "ci@example.test",
                "0900000000", LocalDate.of(1990, 1, 1), true, true, null, null, null,
                null, false, null, null, null, null, true, gross, gross, fingerprint);
    }

    private CreateBookingBatchRequest batch(List<UUID> roomIds, LocalDate checkIn, LocalDate checkOut,
            UUID token, BigDecimal gross, String fingerprint, String hotelCode) {
        return new CreateBookingBatchRequest(customerId, hotelId, roomIds, checkIn, checkOut,
                1, 0, PaymentOption.PAY_AT_HOTEL, "CI", "Customer", "ci@example.test",
                "0900000000", LocalDate.of(1990, 1, 1), true, true, null, null, null,
                null, false, null, null, null, null, true, token, hotelCode, null,
                gross, gross, fingerprint);
    }
}
