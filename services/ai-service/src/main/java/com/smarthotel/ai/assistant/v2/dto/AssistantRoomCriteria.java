package com.smarthotel.ai.assistant.v2.dto;

import jakarta.validation.constraints.Pattern;

public record AssistantRoomCriteria(boolean refundableOnly, boolean breakfastOnly,
        @Pattern(regexp = "BALANCED|CHEAPEST|LARGEST|FAMILY|REFUNDABLE|BREAKFAST|QUALITY") String preference) {}
