package com.smarthotel.chat.conversation.dto;

import com.smarthotel.chat.conversation.entity.ArrivalStatus;
import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

public record ArrivalUpdateRequest(
        @NotNull(message = "Trạng thái đến khách sạn là bắt buộc")
        ArrivalStatus status,
        LocalTime expectedArrivalTime
) {
}
