package com.smarthotel.ai.assistant.dto;

import java.time.Instant;

public record AiTextResponse(
        String result,
        String model,
        Instant generatedAt
) {
}