package com.smarthotel.booking.booking.dto;

import com.smarthotel.booking.pricing.dto.LateCheckoutDetailsResponse;

import java.time.Instant;
import java.time.LocalDateTime;

public record CheckInDetailsResponse(
        BookingResponse booking,
        String hotelName,
        String hotelAddress,
        String roomNumber,
        String roomTypeName,
        LocalDateTime expectedCheckInAt,
        LocalDateTime expectedCheckOutAt,
        Instant actualCheckInAt,
        Instant actualCheckOutAt,
        boolean dateValid,
        boolean paymentComplete,
        boolean canCheckIn,
        boolean canCheckOut,
        LateCheckoutDetailsResponse lateCheckout,
        String actionMessage
) {
}
