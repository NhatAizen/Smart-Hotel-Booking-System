package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.booking.entity.Booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ComplaintBookingContextResponse(
        UUID bookingId, String bookingCode, UUID hotelId, UUID roomTypeId, UUID roomId,
        LocalDate checkIn, LocalDate checkOut, Integer adults, Integer children,
        BigDecimal totalPrice, BigDecimal paidAmount, BigDecimal remainingAmount,
        String paymentOption, String paymentStatus, Integer depositPercent, String bookingStatus,
        Instant checkedInAt, Instant checkedOutAt
) {
    public static ComplaintBookingContextResponse from(Booking booking) {
        return new ComplaintBookingContextResponse(
                booking.getId(), booking.getBookingCode(), booking.getHotelId(), booking.getRoomTypeId(),
                booking.getRoomId(), booking.getCheckIn(), booking.getCheckOut(), booking.getAdults(),
                booking.getChildren(), booking.getTotalPrice(), booking.getPaidAmount(),
                booking.getRemainingAmount(), booking.getPaymentOption().name(), booking.getPaymentStatus().name(),
                booking.getDepositPercent(), booking.getStatus().name(), booking.getCheckedInAt(), booking.getCheckedOutAt()
        );
    }
}
