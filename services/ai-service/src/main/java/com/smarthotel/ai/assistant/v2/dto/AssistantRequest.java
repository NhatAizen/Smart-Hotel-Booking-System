package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AssistantRequest(
        @NotBlank(message = "Tin nhắn không được để trống")
        @Size(max = 2000, message = "Tin nhắn tối đa 2000 ký tự")
        String message,
        LocalDate checkIn,
        LocalDate checkOut,
        @Min(1) @Max(20) Integer adults,
        @Min(0) @Max(20) Integer children,
        UUID hotelId,
        @Size(max = 8) List<@Valid AssistantMessage> history
) {
}
