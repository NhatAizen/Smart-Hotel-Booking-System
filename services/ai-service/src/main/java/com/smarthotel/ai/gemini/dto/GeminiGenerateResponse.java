package com.smarthotel.ai.gemini.dto;

import java.util.List;

public record GeminiGenerateResponse(
        List<Candidate> candidates
) {

    public record Candidate(
            Content content
    ) {
    }

    public record Content(
            List<Part> parts
    ) {
    }

    public record Part(
            String text
    ) {
    }
}