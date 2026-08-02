package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.Booking;
import com.smarthotel.booking.booking.entity.BookingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BookingResponse(
        UUID id,
        UUID customerId,
        UUID hotelId,
        UUID roomId,
        LocalDate checkIn,
        LocalDate checkOut,
        Integer guestCount,
        BigDecimal totalPrice,
        BookingStatus status,
        String specialRequest,
        Instant cancelledAt,
        Instant createdAt,
        Instant updatedAt
) {

    public static BookingResponse from(Booking booking) {
        return new BookingResponse(
                booking.getId(),
                booking.getCustomerId(),
                booking.getHotelId(),
                booking.getRoomId(),
                booking.getCheckIn(),
                booking.getCheckOut(),
                booking.getGuestCount(),
                booking.getTotalPrice(),
                booking.getStatus(),
                booking.getSpecialRequest(),
                booking.getCancelledAt(),
                booking.getCreatedAt(),
                booking.getUpdatedAt()
        );
    }
}