package com.smarthotel.booking.pricing.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PricingQuoteRequest(
        @NotNull UUID hotelId,
        @NotEmpty List<UUID> roomIds,
        @NotNull LocalDate checkIn,
        @NotNull LocalDate checkOut
) {}
