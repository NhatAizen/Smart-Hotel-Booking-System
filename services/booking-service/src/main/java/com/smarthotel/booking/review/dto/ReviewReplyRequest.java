package com.smarthotel.booking.review.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReviewReplyRequest(
        @NotBlank(message = "Nội dung phản hồi không được để trống")
        @Size(max = 1500, message = "Phản hồi tối đa 1500 ký tự")
        String content
) {
}
