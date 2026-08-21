package com.smarthotel.booking.review.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record HideReviewRequest(
        @NotBlank(message = "Lý do ẩn đánh giá không được để trống")
        @Size(max = 500, message = "Lý do ẩn tối đa 500 ký tự")
        String reason
) {
}
