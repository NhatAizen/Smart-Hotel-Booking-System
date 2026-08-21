package com.smarthotel.chat.conversation.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;

public record LateCheckoutRequest(
        @NotNull(message = "Giờ trả phòng mong muốn là bắt buộc")
        LocalTime requestedCheckoutTime,
        @Size(max = 500, message = "Ghi chú tối đa 500 ký tự")
        String note
) {
}
