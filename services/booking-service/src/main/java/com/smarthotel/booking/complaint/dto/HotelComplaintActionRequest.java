package com.smarthotel.booking.complaint.dto;

import com.smarthotel.booking.complaint.entity.HotelComplaintAction;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import java.math.BigDecimal;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;

public record HotelComplaintActionRequest(
        @NotNull HotelComplaintAction action,
        @NotBlank @Size(max = 5000) String message,
        UUID refundRequestId,
        @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal refundedAmount
) {}
