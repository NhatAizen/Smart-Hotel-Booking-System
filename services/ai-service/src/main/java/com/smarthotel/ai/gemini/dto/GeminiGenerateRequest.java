package com.smarthotel.ai.gemini.dto;

import java.util.List;

public record GeminiGenerateRequest(
        List<Content> contents,
        GenerationConfig generationConfig
) {

    public record Content(
            String role,
            List<Part> parts
    ) {
    }

    public record Part(
            String text
    ) {
    }

    public record GenerationConfig(
            Double temperature,
            Integer maxOutputTokens
    ) {
    }
}