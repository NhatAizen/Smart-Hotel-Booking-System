package com.smarthotel.ai.assistant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LiveHotelRecommendationRequest(

        @NotBlank(message = "Yêu cầu tư vấn không được để trống")
        @Size(
                max = 2000,
                message = "Yêu cầu tư vấn tối đa 2000 ký tự"
        )
        String requirement

) {
}