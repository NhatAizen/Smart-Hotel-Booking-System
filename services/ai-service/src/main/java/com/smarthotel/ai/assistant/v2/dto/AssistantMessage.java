package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AssistantMessage(
        @NotBlank @Size(max = 20) String role,
        @NotBlank @Size(max = 2000) String content
) {
}
