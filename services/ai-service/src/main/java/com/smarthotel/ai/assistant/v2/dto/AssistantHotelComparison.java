package com.smarthotel.ai.assistant.v2.dto;

import java.util.List;

/** All cells are formatted from the same verified cards, in their display order. */
public record AssistantHotelComparison(String focus, List<Row> rows, String note) {
    public record Row(String label, List<String> values) {}
}
