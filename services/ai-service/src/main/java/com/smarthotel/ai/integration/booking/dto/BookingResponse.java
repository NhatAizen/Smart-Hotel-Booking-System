package com.smarthotel.ai.integration.booking.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record BookingResponse(
        UUID id,
        String bookingCode,
        UUID customerId,
        UUID hotelId,
        UUID roomTypeId,
        UUID roomId,
        LocalDate checkIn,
        LocalDate checkOut,
        Integer adults,
        Integer children,
        BigDecimal totalPrice,
        BigDecimal paidAmount,
        BigDecimal remainingAmount,
        String paymentOption,
        String paymentStatus,
        String status,
        Instant createdAt
) {
}
