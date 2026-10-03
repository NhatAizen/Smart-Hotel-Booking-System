package com.smarthotel.booking.booking.roomchange;

import com.smarthotel.booking.booking.entity.*;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.booking.hold.RoomHoldService;
import com.smarthotel.booking.booking.realtime.AvailabilityRealtimeService;
import com.smarthotel.booking.booking.roomchange.financial.*;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import com.smarthotel.booking.pricing.repository.BookingNightPriceRepository;
import com.smarthotel.booking.pricing.service.PricingService;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RoomChangeApprovalFinancialStateTest {
    @Test void enabledApprovalEnqueuesUnknownDueNotZero() { approve(true); }
    @Test void disabledApprovalPreservesLegacyDueWithoutOutbox() { approve(false); }
    private void approve(boolean enabled) {
        var bookings = mock(BookingRepository.class); var requests = mock(RoomChangeRequestRepository.class);
        var hotel = mock(HotelClient.class); var pricing = mock(PricingService.class);
        var nights = mock(BookingNightPriceRepository.class); var holds = mock(RoomHoldService.class);
        var notifications = mock(NotificationClient.class); var outbox = mock(RoomChangeFinancialOutboxService.class);
        var feature = mock(RoomChangeCreditFeature.class); when(feature.isEnabled()).thenReturn(enabled);
        var b = new Booking("EZR-APPROVAL", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), LocalDate.now().plusDays(10), LocalDate.now().plusDays(11),
                2, 0, new BigDecimal("1600000"), PaymentOption.FULL_PAYMENT, null, null,
                "Test", "Customer", "test@example.com", "0900000000", null, true, true,
                null, null, null, null, false, null, null, null, null, true);
        b.applyPayment(new BigDecimal("1600000"), BookingPaymentType.FULL_PAYMENT);
        var r = new RoomChangeRequest(b.getId(), b.getCustomerId(), b.getHotelId(), b.getRoomId(),
                b.getRoomTypeId(), UUID.randomUUID(), UUID.randomUUID(), "Upgrade");
        org.springframework.test.util.ReflectionTestUtils.setField(r, "financialReconciliationStatus", "LEGACY");
        when(requests.findBookingId(r.getId())).thenReturn(java.util.Optional.of(b.getId()));
        when(requests.findForUpdate(r.getId())).thenReturn(java.util.Optional.of(r));
        when(bookings.findForUpdate(b.getId())).thenReturn(java.util.Optional.of(b));
        when(hotel.getHotel(any())).thenReturn(new HotelClient.HotelDetails(b.getHotelId(), b.getHotelId(),
                "Test", "Local", "Test", null, null));
        when(hotel.getRoom(any())).thenReturn(new HotelClient.RoomDetails(r.getTargetRoomId(), b.getHotelId(),
                r.getTargetRoomTypeId(), "104", 1, "AVAILABLE", null, null));
        when(hotel.getRoomType(any())).thenReturn(new HotelClient.RoomTypeDetails(r.getTargetRoomTypeId(), b.getHotelId(),
                "Upgrade", "Test", new BigDecimal("1900000"), 3, 2, "DOUBLE", 1, BigDecimal.TEN,
                false, true, false, true, true, 50, true));
        when(pricing.calculateRoomPricing(any(), any(), any(), any(), any(), any(), any())).thenReturn(
                new PricingService.RoomPricing(r.getTargetRoomId(), r.getTargetRoomTypeId(), "104", "Upgrade",
                        new BigDecimal("1900000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("1900000"), List.of()));
        when(nights.findAllByBookingIdOrderByStayDateAsc(any())).thenReturn(List.of());
        when(holds.acquire(any(), any(), any(), any(), any(), any())).thenReturn(mock(RoomHoldService.Hold.class));
        var service = new RoomChangeService(requests, bookings, hotel, pricing, nights, holds,
                mock(AvailabilityRealtimeService.class), notifications, feature, outbox);
        var response = service.approve(b.getHotelId(), r.getId(), new ApproveRoomChangeRequest(null));
        if (enabled) {
            assertThat(response.additionalPaymentDue()).isNull();
            assertThat(response.financialReconciliationStatus()).isEqualTo("PENDING");
            verify(outbox).enqueue(eq(r.getId()), eq(b.getId()), eq(b.getCustomerId()),
                    eq(new BigDecimal("1900000.00")), eq(new BigDecimal("1600000.00")), eq(1L));
        } else {
            assertThat(response.additionalPaymentDue()).isEqualByComparingTo("300000");
            assertThat(response.financialReconciliationStatus()).isEqualTo("NOT_REQUIRED");
            verifyNoInteractions(outbox);
        }
        var order = inOrder(bookings, requests);
        order.verify(bookings).findForUpdate(b.getId()); order.verify(requests).findForUpdate(r.getId());
    }
}
