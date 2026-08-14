package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.dto.RoleChangeBookingEligibilityRequest;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.pricing.service.PricingService;
import com.smarthotel.booking.rolechange.fence.OwnerDemotionFenceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingServiceRoleChangeTest {

    @Mock BookingRepository bookingRepository;
    @Mock HotelClient hotelClient;
    @Mock NotificationClient notificationClient;
    @Mock RoomHoldService roomHoldService;
    @Mock AvailabilityRealtimeService realtimeService;
    @Mock PricingService pricingService;
    @Mock OwnerDemotionFenceService ownerDemotionFenceService;

    @InjectMocks BookingService bookingService;

    @Test
    void ownerWithoutHotelsIsEligibleWithoutQueryingBookings() {
        var response = bookingService.getRoleChangeEligibility(
                new RoleChangeBookingEligibilityRequest(UUID.randomUUID(), List.of())
        );

        assertThat(response.eligible()).isTrue();
        assertThat(response.currentStayCount()).isZero();
        assertThat(response.actionableBookingCount()).isZero();
        assertThat(response.blockers()).isEmpty();
        verify(bookingRepository, never()).countActionableBookings(
                any(),
                any(),
                any(),
                any()
        );
    }

    @Test
    void currentStaysAndActionableBookingsBlockRoleChange() {
        UUID hotelId = UUID.randomUUID();
        List<UUID> hotelIds = List.of(hotelId);
        when(bookingRepository.countByHotelIdInAndStatus(
                hotelIds,
                BookingStatus.CHECKED_IN
        )).thenReturn(2L);
        when(bookingRepository.countActionableBookings(
                org.mockito.ArgumentMatchers.eq(hotelIds),
                org.mockito.ArgumentMatchers.eq(List.of(
                        BookingStatus.PENDING,
                        BookingStatus.CONFIRMED
                )),
                any(Instant.class),
                any(LocalDate.class)
        )).thenReturn(3L);

        var response = bookingService.getRoleChangeEligibility(
                new RoleChangeBookingEligibilityRequest(UUID.randomUUID(), hotelIds)
        );

        assertThat(response.eligible()).isFalse();
        assertThat(response.currentStayCount()).isEqualTo(2);
        assertThat(response.actionableBookingCount()).isEqualTo(3);
        assertThat(response.blockers()).hasSize(2);
    }
}
