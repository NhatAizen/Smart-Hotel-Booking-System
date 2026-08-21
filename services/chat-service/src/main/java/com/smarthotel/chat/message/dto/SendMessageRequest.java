package com.smarthotel.chat.message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
        @NotBlank(message = "Nội dung tin nhắn không được để trống")
        @Size(max = 3000, message = "Tin nhắn tối đa 3000 ký tự")
        String content
) {
}
