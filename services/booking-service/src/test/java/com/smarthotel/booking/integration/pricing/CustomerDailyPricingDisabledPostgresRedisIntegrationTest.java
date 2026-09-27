package com.smarthotel.booking.integration.pricing;

import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.service.BookingService;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.membership.dto.MembershipProfileResponse;
import com.smarthotel.booking.policy.service.PlatformPolicyService;
import com.smarthotel.booking.pricing.dto.PricingQuoteRequest;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.promotion.service.PromotionService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@EnabledIfEnvironmentVariable(named = "CI_DAILY_PRICING_INTEGRATION", matches = "true")
@SpringBootTest(properties = {"pricing.manual-daily-customer-enabled=false",
        "booking.hold.cleanup-delay-ms=3600000", "spring.rabbitmq.listener.simple.auto-startup=false"})
class CustomerDailyPricingDisabledPostgresRedisIntegrationTest {
    @BeforeAll
    static void requireDisposableServices() {
        assertThat(System.getenv("DB_URL"))
                .isEqualTo("jdbc:postgresql://localhost:5432/booking_daily_ci");
        assertThat(System.getenv("DB_USERNAME")).isEqualTo("ci_daily");
        assertThat(System.getenv("REDIS_HOST")).isEqualTo("localhost");
    }

    @Autowired PricingService pricing;
    @Autowired BookingService bookings;
    @MockBean HotelClient hotel;
    @MockBean NotificationClient notifications;
    @MockBean AvailabilityRealtimeService realtime;
    @MockBean OwnerDemotionFenceService ownerFence;
    @MockBean PlatformPolicyService platformPolicy;
    @MockBean PromotionService promotions;

    @Test
    void quoteAndLegacyClientBookingUseWeekendAndCustomPriceWithoutDailyApi() {
        UUID hotelId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        UUID typeId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        LocalDate saturday = LocalDate.now().plusWeeks(2)
                .with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
        when(hotel.getHotel(hotelId)).thenReturn(new HotelClient.HotelDetails(
                hotelId, ownerId, "CI Synthetic Hotel", "CI Street", "CI City", LocalTime.of(14, 0), LocalTime.NOON));
        when(hotel.getHotelPolicy(hotelId)).thenReturn(new HotelClient.HotelPolicyDetails(
                hotelId, LocalTime.of(14, 0), LocalTime.NOON, true, null, null, false, false,
                false, false, false, null, null, false, null, List.of(), true));
        when(hotel.getRoom(roomId)).thenReturn(new HotelClient.RoomDetails(
                roomId, hotelId, typeId, "101", 1, "AVAILABLE", new BigDecimal("900.00"), null));
        when(hotel.getRoomType(typeId)).thenReturn(new HotelClient.RoomTypeDetails(
                typeId, hotelId, "Suite", null, new BigDecimal("1000.00"), 4, 2,
                "KING", 1, null, false, true, false, true, true, 30, true));
        when(platformPolicy.minimumBookingAge()).thenReturn(18);
        when(promotions.plan(eq(customerId), eq(hotelId), any(), nullable(String.class), nullable(String.class)))
                .thenAnswer(invocation -> {
                    BigDecimal gross = invocation.getArgument(2);
                    BigDecimal zero = new BigDecimal("0.00");
                    return new PromotionService.DiscountPlan(
                            new MembershipProfileResponse(0, "CI", 0, zero, null, null, 0),
                            null, null, gross, zero, zero, zero, zero, gross, zero);
                });

        var quote = pricing.quote(new PricingQuoteRequest(hotelId, List.of(roomId),
                saturday, saturday.plusDays(1)));
        assertThat(quote.totalAmount()).isEqualByComparingTo("990.00");
        assertThat(quote.pricingFingerprint()).isNull();
        var legacyRequest = new CreateBookingRequest(customerId, hotelId, roomId,
                saturday, saturday.plusDays(1), 1, 0, PaymentOption.PAY_AT_HOTEL,
                "CI", "Customer", "ci@example.test", "0900000000", LocalDate.of(1990, 1, 1),
                true, true, null, null, null, null, false, null, null, null, null,
                true, null, null, null);
        var saved = bookings.create(legacyRequest);
        assertThat(saved.totalPrice()).isEqualByComparingTo(quote.totalAmount());
        verify(hotel, never()).getCustomerDailyPrices(any(), any(), any(), any());
    }
}
