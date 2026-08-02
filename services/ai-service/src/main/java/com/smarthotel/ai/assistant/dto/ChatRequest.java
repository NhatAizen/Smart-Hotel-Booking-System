package com.smarthotel.ai.assistant.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChatRequest(

        @NotBlank(message = "Message is required")
        @Size(max = 3000, message = "Message must not exceed 3000 characters")
        String message

) {
}