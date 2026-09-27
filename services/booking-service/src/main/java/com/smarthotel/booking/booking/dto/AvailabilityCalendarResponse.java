package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.booking.entity.BookingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AvailabilityCalendarResponse(
        UUID hotelId,
        String hotelName,
        LocalDate from,
        LocalDate to,
        Instant generatedAt,
        List<RoomItem> rooms,
        List<BookingItem> bookings,
        List<HoldItem> holds
) {
    public record RoomItem(
            UUID id,
            UUID roomTypeId,
            String roomNumber,
            Integer floor,
            String status,
            BigDecimal customPrice,
            String note
    ) {
    }

    public record BookingItem(
            UUID id,
            String bookingCode,
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            BookingStatus status,
            String guestName,
            Integer guestCount,
            Instant checkedInAt,
            Instant checkedOutAt
    ) {
    }

    public record HoldItem(
            UUID roomId,
            LocalDate checkIn,
            LocalDate checkOut,
            Instant expiresAt
    ) {
    }
}
