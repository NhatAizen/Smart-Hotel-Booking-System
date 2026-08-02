package com.smarthotel.ai.assistant.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record HotelRecommendationRequest(

        @NotBlank(message = "User requirement is required")
        @Size(max = 3000, message = "User requirement must not exceed 3000 characters")
        String requirement,

        @NotEmpty(message = "At least one hotel candidate is required")
        List<@Valid HotelCandidate> hotels

) {
}