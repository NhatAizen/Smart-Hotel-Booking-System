package com.smarthotel.booking.booking.service;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.PaymentOption;
import com.smarthotel.booking.booking.repository.BookingRepository;
import com.smarthotel.booking.integration.hotel.HotelClient;
import com.smarthotel.booking.integration.notification.NotificationClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class InvoiceEmailServiceTest {
    private final BookingRepository repository = mock(BookingRepository.class);
    private final HotelClient hotels = mock(HotelClient.class);
    private final NotificationClient notifications = mock(NotificationClient.class);
    private final InvoiceEmailService service = new InvoiceEmailService(repository, hotels, notifications);
    private final Booking booking = mock(Booking.class);
    private final UUID bookingId = UUID.randomUUID();
    private final UUID hotelId = UUID.randomUUID();
    private final UUID customerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(repository.findPendingInvoiceEmails()).thenReturn(List.of(booking));
        when(booking.getId()).thenReturn(bookingId);
        when(booking.getCustomerId()).thenReturn(customerId);
        when(booking.getHotelId()).thenReturn(hotelId);
        when(booking.getBookingCode()).thenReturn("ALH-02");
        when(booking.getInvoiceEmail()).thenReturn("invoice@example.com");
        when(booking.getInvoiceCompanyName()).thenReturn("Công ty kiểm thử");
        when(booking.getInvoiceTaxCode()).thenReturn("0123456789");
        when(booking.getInvoiceAddress()).thenReturn("Địa chỉ kiểm thử");
        when(booking.getCheckIn()).thenReturn(LocalDate.of(2026, 9, 4));
        when(booking.getCheckOut()).thenReturn(LocalDate.of(2026, 9, 5));
        when(booking.getPaymentOption()).thenReturn(PaymentOption.PAY_AT_HOTEL);
        when(booking.getGrossAmount()).thenReturn(BigDecimal.valueOf(10000));
        when(booking.getTotalDiscountAmount()).thenReturn(BigDecimal.valueOf(200));
        when(booking.getTotalPrice()).thenReturn(BigDecimal.valueOf(9800));
        when(booking.getPaidAmount()).thenReturn(BigDecimal.ZERO);
        when(booking.getRemainingAmount()).thenReturn(BigDecimal.valueOf(9800));
        when(hotels.getHotel(hotelId)).thenReturn(new HotelClient.HotelDetails(
                hotelId, UUID.randomUUID(), "Aura Luxury Hotel", "Address", "Vung Tau", null, null));
    }

    @Test
    void sendsToInvoiceAddressAndMarksOnlyAfterDelivery() {
        service.sendPendingInvoices();
        var order = inOrder(notifications, repository);
        order.verify(notifications).sendInvoice(any(), eq(customerId), eq("invoice@example.com"),
                contains("ALH-02"), contains("Còn phải thanh toán: 9.800 đ"), contains(bookingId.toString()));
        order.verify(repository).markInvoiceEmailSent(eq(bookingId), any());
        String content = InvoiceEmailService.content(booking, "Aura Luxury Hotel");
        assertThat(content).contains("Công ty kiểm thử", "0123456789", "Địa chỉ kiểm thử",
                "04/09/2026", "05/09/2026", "Đã thanh toán: 0 đ", "Giảm giá: 200 đ");
    }

    @Test
    void failedDeliveryIsRetriedWithSameIdentifier() {
        doThrow(new IllegalStateException("SMTP unavailable")).doNothing().when(notifications)
                .sendInvoice(any(), any(), any(), any(), any(), any());
        service.sendPendingInvoices();
        verify(repository, never()).markInvoiceEmailSent(any(), any());
        service.sendPendingInvoices();
        var deliveryIds = org.mockito.ArgumentCaptor.forClass(UUID.class);
        verify(notifications, times(2)).sendInvoice(deliveryIds.capture(), any(), any(), any(), any(), any());
        assertThat(deliveryIds.getAllValues()).hasSize(2).allMatch(deliveryIds.getValue()::equals);
        verify(repository).markInvoiceEmailSent(eq(bookingId), any());
    }

    @Test
    void doesNotSendWhenThereAreNoEligibleBookings() {
        when(repository.findPendingInvoiceEmails()).thenReturn(List.of());
        service.sendPendingInvoices();
        verifyNoInteractions(notifications, hotels);
        verify(repository, never()).markInvoiceEmailSent(any(), any());
    }
}
