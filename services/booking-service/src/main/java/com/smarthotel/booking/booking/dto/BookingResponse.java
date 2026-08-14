package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingPaymentStatus;
import com.smarthotel.booking.booking.entity.BookingStatus;
import com.smarthotel.booking.booking.entity.PaymentOption;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BookingResponse(
        UUID id,
        UUID bookingGroupId,
        String bookingCode,
        String checkInCode,
        UUID customerId,
        UUID hotelId,
        UUID roomTypeId,
        UUID roomId,
        LocalDate checkIn,
        LocalDate checkOut,
        Integer guestCount,
        Integer adults,
        Integer children,
        BigDecimal totalPrice,
        BigDecimal baseAccommodationAmount,
        BigDecimal weekendSurchargeAmount,
        BigDecimal specialDateSurchargeAmount,
        BigDecimal lateCheckoutFee,
        Instant lateFeeAssessedAt,
        BigDecimal paidAmount,
        BigDecimal remainingAmount,
        BigDecimal paymentDueAmount,
        PaymentOption paymentOption,
        BookingPaymentStatus paymentStatus,
        Integer depositPercent,
        BookingStatus status,
        String bookerFirstName,
        String bookerLastName,
        String bookerEmail,
        String bookerPhone,
        boolean bookerIsGuest,
        String guestFirstName,
        String guestLastName,
        String guestPhone,
        String specialRequest,
        boolean invoiceRequested,
        String invoiceCompanyName,
        String invoiceTaxCode,
        String invoiceAddress,
        String invoiceEmail,
        boolean termsAccepted,
        Instant paymentExpiresAt,
        Instant cancelledAt,
        Instant checkedInAt,
        Instant checkedOutAt,
        Instant createdAt,
        Instant updatedAt
) {
    public static BookingResponse from(Booking booking) {
        return new BookingResponse(
                booking.getId(), booking.getBookingGroupId(), booking.getBookingCode(),
                booking.getCheckInCode(), booking.getCustomerId(), booking.getHotelId(),
                booking.getRoomTypeId(), booking.getRoomId(), booking.getCheckIn(),
                booking.getCheckOut(), booking.getGuestCount(), booking.getAdults(),
                booking.getChildren(), booking.getTotalPrice(),
                booking.getBaseAccommodationAmount(), booking.getWeekendSurchargeAmount(),
                booking.getSpecialDateSurchargeAmount(), booking.getLateCheckoutFee(),
                booking.getLateFeeAssessedAt(), booking.getPaidAmount(),
                booking.getRemainingAmount(), booking.getPaymentDueAmount(),
                booking.getPaymentOption(), booking.getPaymentStatus(),
                booking.getDepositPercent(), booking.getStatus(),
                booking.getBookerFirstName(), booking.getBookerLastName(),
                booking.getBookerEmail(), booking.getBookerPhone(),
                booking.isBookerIsGuest(), booking.getGuestFirstName(),
                booking.getGuestLastName(), booking.getGuestPhone(),
                booking.getSpecialRequest(), booking.isInvoiceRequested(),
                booking.getInvoiceCompanyName(), booking.getInvoiceTaxCode(),
                booking.getInvoiceAddress(), booking.getInvoiceEmail(),
                booking.isTermsAccepted(), booking.getPaymentExpiresAt(),
                booking.getCancelledAt(), booking.getCheckedInAt(), booking.getCheckedOutAt(),
                booking.getCreatedAt(), booking.getUpdatedAt()
        );
    }
}
