package com.smarthotel.ai.assistant.v2.dto;

import java.time.Instant;
import java.util.List;

public record AssistantResponse(
        String intent,
        String answer,
        AssistantQueryContext context,
        List<AssistantHotelCard> hotels,
        List<AssistantBookingCard> bookings,
        List<String> suggestedPrompts,
        String model,
        Instant generatedAt
) {
}
