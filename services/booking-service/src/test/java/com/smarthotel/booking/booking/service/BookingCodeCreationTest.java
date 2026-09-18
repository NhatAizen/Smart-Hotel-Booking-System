package com.smarthotel.booking.booking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.booking.code.BookingCodeSequence;
import com.smarthotel.booking.booking.code.BookingCodeSequenceRepository;
import com.smarthotel.booking.booking.code.BookingCodeService;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
import com.smarthotel.booking.booking.dto.CreateBookingRequest;
import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.membership.dto.MembershipProfileResponse;
import com.smarthotel.booking.policy.service.PlatformPolicyService;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.promotion.service.PromotionService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingCodeCreationTest {
    @Mock BookingRepository bookingRepository;
    @Mock BookingCodeSequenceRepository sequenceRepository;
    @Mock HotelClient hotelClient;
    @Mock NotificationClient notificationClient;
    @Mock RoomHoldService roomHoldService;
    @Mock AvailabilityRealtimeService realtimeService;
    @Mock PricingService pricingService;
    @Mock PromotionService promotionService;
    @Mock OwnerDemotionFenceService ownerDemotionFenceService;
    @Mock PlatformPolicyService platformPolicyService;

    private final Map<UUID, BookingCodeSequence> sequences = new HashMap<>();
    private final List<Booking> savedBookings = new ArrayList<>();
    private final UUID hotelId = UUID.randomUUID();
    private final UUID customerId = UUID.randomUUID();
    private final UUID roomTypeId = UUID.randomUUID();
    private final LocalDate checkIn = LocalDate.now().plusDays(10);
    private BookingService service;

    @BeforeEach
    void setUp() {
        service = new BookingService(
                bookingRepository, new BookingCodeService(sequenceRepository), hotelClient,
                notificationClient, roomHoldService, realtimeService, pricingService,
                promotionService, ownerDemotionFenceService, platformPolicyService,
                new ObjectMapper().findAndRegisterModules()
        );
        when(sequenceRepository.initializeIfMissing(any(), anyString())).thenAnswer(invocation -> {
            sequences.putIfAbsent(invocation.getArgument(0),
                    new BookingCodeSequence(invocation.getArgument(0), invocation.getArgument(1)));
            return 1;
        });
        when(sequenceRepository.findForUpdate(any())).thenAnswer(invocation ->
                Optional.ofNullable(sequences.get(invocation.getArgument(0))));
        when(hotelClient.getHotel(hotelId)).thenReturn(new HotelClient.HotelDetails(
                hotelId, UUID.randomUUID(), "Aura Luxury Hotel", "Address", "Vung Tau",
                LocalTime.of(14, 0), LocalTime.of(12, 0)
        ));
        when(platformPolicyService.minimumBookingAge()).thenReturn(18);
        when(hotelClient.getRoom(any())).thenAnswer(invocation -> new HotelClient.RoomDetails(
                invocation.getArgument(0), hotelId, roomTypeId, "101", 1, "AVAILABLE", null, null
        ));
        when(hotelClient.getRoomType(roomTypeId)).thenReturn(new HotelClient.RoomTypeDetails(
                roomTypeId, hotelId, "Suite", null, BigDecimal.valueOf(1_000_000),
                2, 1, "KING", 1, BigDecimal.valueOf(35), false,
                true, false, true, true, 30, true
        ));
        when(pricingService.calculateRoomPricing(any(), any(), any(), any(), any(), any(), any()))
                .thenAnswer(invocation -> new PricingService.RoomPricing(
                        invocation.getArgument(0), roomTypeId, "101", "Suite",
                        BigDecimal.valueOf(1_000_000), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.valueOf(1_000_000), List.of()
                ));
        when(promotionService.plan(any(), any(), any(), any(), any())).thenAnswer(invocation ->
                new PromotionService.DiscountPlan(
                        new MembershipProfileResponse(0, "Member", 0, BigDecimal.ZERO, null, null, 0),
                        null, null, invocation.getArgument(2), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, invocation.getArgument(2), BigDecimal.ZERO
                ));
        when(roomHoldService.acquire(any(), any(), any(), any(), any(), any())).thenAnswer(invocation -> {
            UUID token = invocation.getArgument(0);
            return new RoomHoldService.Hold(new RoomHoldService.HoldMetadata(
                    token.toString(), token, customerId, hotelId, invocation.getArgument(3),
                    checkIn, checkIn.plusDays(1), Instant.now().plusSeconds(600)
            ), List.of());
        });
        when(bookingRepository.saveAll(any())).thenAnswer(invocation -> {
            List<Booking> bookings = invocation.getArgument(0);
            savedBookings.addAll(bookings);
            return bookings;
        });
    }

    @Test
    void singleAndBatchBookingsKeepUsingHotelInitialsAcrossRequests() {
        var single = service.create(new CreateBookingRequest(
                customerId, hotelId, UUID.randomUUID(), checkIn, checkIn.plusDays(1),
                1, 0, PaymentOption.PAY_AT_HOTEL,
                "Nguyen", "An", "an@example.com", "0900000000",
                LocalDate.of(1990, 1, 1), true, true, null, null, null, null,
                false, null, null, null, null, true
        ));
        var batch = service.createBatch(new CreateBookingBatchRequest(
                customerId, hotelId, List.of(UUID.randomUUID(), UUID.randomUUID()),
                checkIn, checkIn.plusDays(1), 1, 0, PaymentOption.PAY_AT_HOTEL,
                "Nguyen", "An", "an@example.com", "0900000000",
                LocalDate.of(1990, 1, 1), true, true, null, null, null, null,
                false, null, null, null, null, true, null, null, null
        ));

        assertThat(single.bookingCode()).isEqualTo("ALH-01");
        assertThat(batch).extracting(response -> response.bookingCode())
                .containsExactly("ALH-02", "ALH-03");
        assertThat(savedBookings).extracting(Booking::getBookingCode)
                .containsExactly("ALH-01", "ALH-02", "ALH-03");
        assertThat(savedBookings).extracting(Booking::getCheckInCode).doesNotHaveDuplicates();
    }
}
