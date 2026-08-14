package com.smarthotel.ai.assistant.v2.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record AssistantBookingCard(
        UUID bookingId,
        String bookingCode,
        UUID hotelId,
        String hotelName,
        String hotelCoverImageUrl,
        String roomTypeName,
        LocalDate checkIn,
        LocalDate checkOut,
        LocalTime hotelCheckInTime,
        LocalTime hotelCheckOutTime,
        String bookingStatus,
        String paymentStatus,
        String paymentOption,
        BigDecimal totalPrice,
        BigDecimal paidAmount,
        BigDecimal remainingAmount,
        Integer adults,
        Integer children,
        Boolean refundable
) {
}
