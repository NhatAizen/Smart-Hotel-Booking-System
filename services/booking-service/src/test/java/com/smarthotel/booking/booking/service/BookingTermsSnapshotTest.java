package com.smarthotel.booking.booking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.booking.booking.code.BookingCodeService;
import com.smarthotel.booking.booking.dto.CreateBookingBatchRequest;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingTermsSnapshotTest {

    @Mock BookingRepository bookingRepository;
    @Mock BookingCodeService bookingCodeService;
    @Mock HotelClient hotelClient;
    @Mock NotificationClient notificationClient;
    @Mock RoomHoldService roomHoldService;
    @Mock AvailabilityRealtimeService realtimeService;
    @Mock PricingService pricingService;
    @Mock PromotionService promotionService;
    @Mock OwnerDemotionFenceService ownerDemotionFenceService;
    @Mock PlatformPolicyService platformPolicyService;

    private BookingService bookingService;

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
                bookingRepository,
                bookingCodeService,
                hotelClient,
                notificationClient,
                roomHoldService,
                realtimeService,
                pricingService,
                promotionService,
                ownerDemotionFenceService,
                platformPolicyService,
                new ObjectMapper().findAndRegisterModules()
        );
    }

    @Test
    void newBookingKeepsHotelAndPlatformTermsSnapshotInDetailResponse() {
        UUID customerId = UUID.randomUUID();
        UUID hotelId = UUID.randomUUID();
        UUID hotelOwnerId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        UUID roomTypeId = UUID.randomUUID();
        UUID holdToken = UUID.randomUUID();
        LocalDate checkIn = LocalDate.now().plusDays(10);
        LocalDate checkOut = checkIn.plusDays(2);

        var hotel = new HotelClient.HotelDetails(
                hotelId, hotelOwnerId, "Snapshot Hotel", "Address", "City",
                LocalTime.of(14, 0), LocalTime.of(12, 0)
        );
        var hotelPolicy = new HotelClient.HotelPolicyDetails(
                hotelId, LocalTime.of(14, 0), LocalTime.of(12, 0),
                null, null, null, null, null, null, null, null,
                null, null, null, null, List.of(), true
        );
        var room = new HotelClient.RoomDetails(
                roomId, hotelId, roomTypeId, "A101", 1, "AVAILABLE", null, null
        );
        var roomType = new HotelClient.RoomTypeDetails(
                roomTypeId, hotelId, "Suite", null, BigDecimal.valueOf(1_000_000),
                2, 1, "KING", 1, BigDecimal.valueOf(35), false,
                true, false, true, true, 30, true
        );
        var pricing = new PricingService.RoomPricing(
                roomId, roomTypeId, "A101", "Suite",
                BigDecimal.valueOf(2_000_000), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.valueOf(2_000_000), List.of()
        );
        var membership = new MembershipProfileResponse(
                0, "Member", 0, BigDecimal.ZERO, null, null, 0
        );
        var discountPlan = new PromotionService.DiscountPlan(
                membership, null, null,
                BigDecimal.valueOf(2_000_000), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.valueOf(2_000_000),
                BigDecimal.ZERO
        );
        var holdMetadata = new RoomHoldService.HoldMetadata(
                holdToken.toString(), holdToken, customerId, hotelId,
                List.of(roomId), checkIn, checkOut, Instant.now().plusSeconds(600)
        );

        when(hotelClient.getHotel(hotelId)).thenReturn(hotel);
        when(bookingCodeService.nextCode(hotelId, hotel.name())).thenReturn("SH-01");
        when(hotelClient.getHotelPolicy(hotelId)).thenReturn(hotelPolicy);
        when(platformPolicyService.minimumBookingAge()).thenReturn(18);
        when(bookingRepository.existsOverlappingBooking(any(), any(), any(), any()))
                .thenReturn(false);
        when(hotelClient.getRoom(roomId)).thenReturn(room);
        when(hotelClient.getRoomType(roomTypeId)).thenReturn(roomType);
        when(pricingService.calculateRoomPricing(
                roomId, roomTypeId, "A101", "Suite",
                BigDecimal.valueOf(1_000_000), checkIn, checkOut
        )).thenReturn(pricing);
        when(promotionService.plan(customerId, hotelId, pricing.totalAmount(), null, null))
                .thenReturn(discountPlan);
        when(roomHoldService.acquire(
                any(UUID.class), any(UUID.class), any(UUID.class), any(), any(), any()
        )).thenReturn(new RoomHoldService.Hold(holdMetadata, List.of()));
        when(bookingRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var request = new CreateBookingBatchRequest(
                customerId, hotelId, List.of(roomId), checkIn, checkOut,
                1, 0, PaymentOption.PAY_AT_HOTEL,
                "Nguyen", "An", "an@example.com", "0900000000",
                LocalDate.of(1990, 1, 1), true, true,
                null, null, null, null,
                false, null, null, null, null,
                true, null, null, null
        );

        var response = bookingService.createBatch(request).get(0);

        ArgumentCaptor<List<Booking>> savedCaptor = ArgumentCaptor.forClass(List.class);
        org.mockito.Mockito.verify(bookingRepository).saveAll(savedCaptor.capture());
        Booking saved = savedCaptor.getValue().get(0);

        assertThat(saved.getHotelPolicySnapshot()).contains(hotelId.toString());
        assertThat(saved.getMinimumAgeSnapshot()).isEqualTo(18);
        assertThat(saved.getRoomRefundableSnapshot()).isTrue();
        assertThat(response.hotelPolicySnapshot()).isEqualTo(saved.getHotelPolicySnapshot());
        assertThat(response.minimumAgeSnapshot()).isEqualTo(18);
        assertThat(response.roomRefundableSnapshot()).isTrue();
    }
}
