package com.smarthotel.ai.assistant.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ReviewSummaryRequest(

        @NotEmpty(message = "At least one review is required")
        List<
                @Size(
                        max = 3000,
                        message = "Each review must not exceed 3000 characters"
                )
                String
        > reviews

) {
}